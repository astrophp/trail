<?php

use Astro\Trail\Capture\Recorder;
use Astro\Trail\Capture\Sampler;
use Astro\Trail\Enums\SpanType;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Pricing\CostCalculator;
use Astro\Trail\RecordingCandidate;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Agents\CountingParticipantAgent;
use Astro\Trail\Tests\Fixtures\Agents\RememberingAgent;
use Astro\Trail\Tests\Fixtures\Agents\ResearcherAgent;
use Astro\Trail\Tests\Fixtures\Agents\SummarizerAgent;
use Astro\Trail\Tests\Fixtures\Capture\BrokenCache;
use Astro\Trail\Tests\Fixtures\Capture\Streams;
use Astro\Trail\Tests\Fixtures\Capture\ThrowingSampler;
use Astro\Trail\Tests\Fixtures\Conversations\ConversationParticipant;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Storage\DatabaseStoreProbe;
use Astro\Trail\Tests\Fixtures\Storage\Transactions;
use Astro\Trail\Tests\Fixtures\Tools\CallbackTool;
use Illuminate\Contracts\Cache\Factory as CacheFactory;
use Illuminate\Database\Events\TransactionBeginning;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Http;
use Laravel\Ai\Embeddings;
use Laravel\Ai\Events\PromptingAgent;
use Laravel\Ai\Responses\Data\ToolCall;

/*
|--------------------------------------------------------------------------
| Deciding what is recorded
|--------------------------------------------------------------------------
|
| The decision is made once, when a top-level run starts. Everything under a
| skipped run is dropped with it, and a skipped run leaves no rows at all.
|
*/

beforeEach(function () {
    config(['cache.default' => 'array']);

    $this->probe = new DatabaseStoreProbe;

    /** Rows in both tables. */
    $this->rows = fn (): array => [$this->probe->traceCount(), $this->probe->spanCount()];

    /** Install a sampler with the draws a test dictates; the rate is read from config as it is built. */
    $this->sampler = function (float|string $rate, array $draws = []) {
        config(['trail.sampling' => $rate]);
        $this->draws = 0;

        $sampler = new Sampler($this->app->make('config'), $this->app->make(CacheFactory::class), function () use (&$draws): float {
            $this->draws++;

            return array_shift($draws) ?? 0.0;
        });
        $this->app->instance(Sampler::class, $sampler);

        return $sampler;
    };

    $this->queries = [];
    DB::listen(function ($query) {
        $this->queries[] = $query->sql;
    });

    $this->run = function (string $prompt = 'Hi', array $tools = []) {
        AssistantAgent::fake(['Hello']);

        return (new AssistantAgent($tools))->prompt($prompt);
    };
});

describe('sampling', function () {
    it('records nothing at a rate of zero, without a query or a draw', function () {
        ($this->sampler)(0);

        ($this->run)();
        Trail::flush();
        $queries = $this->queries;

        expect($queries)->toBe([])->and(($this->rows)())->toBe([0, 0])->and($this->draws)->toBe(0);
    });

    it('records everything at a rate of one, without a draw', function () {
        ($this->sampler)(1);

        ($this->run)();
        Trail::flush();

        expect(($this->rows)())->toBe([1, 2])->and($this->draws)->toBe(0);
    });

    it('records exactly the runs whose draw falls below the rate', function () {
        ($this->sampler)(0.5, [0.1, 0.9, 0.4, 0.6, 0.5]);

        foreach (['one', 'two', 'three', 'four', 'five'] as $prompt) {
            ($this->run)($prompt);
        }
        Trail::flush();

        expect(DB::table('trail_spans')->where('type', 'agent')->pluck('input')->map(fn ($input) => json_decode($input, true)['prompt'])->sort()->values()->all())->toBe(['one', 'three'])
            ->and($this->draws)->toBe(5);
    });

    it('reports a rate that is not a number once and records everything', function () {
        Exceptions::fake();
        ($this->sampler)('often');

        ($this->run)();
        ($this->run)();
        Trail::flush();

        Exceptions::assertReportedCount(1);
        expect(($this->rows)()[0])->toBe(2);
    });

    it('clamps a rate outside zero to one', function (float $rate, int $expected) {
        ($this->sampler)($rate, [0.99]);

        ($this->run)();
        Trail::flush();

        expect(($this->rows)()[0])->toBe($expected);
    })->with([[7.0, 1], [-3.0, 0]]);
});

describe('a skipped run', function () {
    it('takes its sub-agent, grandchild and embeddings call with it, leaving no rows and no queries', function (Closure $skip) {
        $skip($this);
        Embeddings::fake([[[0.1, 0.2]]]);

        $embed = new CallbackTool('embed', fn () => (string) count(Embeddings::for(['a'])->generate()));
        $grandchildTool = new CallbackTool('summarise', fn () => (new SummarizerAgent)->prompt('Summarise')->text);
        $childTool = new CallbackTool('ask', fn () => (new ResearcherAgent([$grandchildTool, $embed]))->prompt('Dig')->text);

        AssistantAgent::fake([new ToolCall('c1', 'ask', ['query' => 'x']), 'Done']);
        ResearcherAgent::fake([new ToolCall('c2', 'summarise', ['query' => 'x']), new ToolCall('c3', 'embed', ['query' => 'x']), 'found it']);
        SummarizerAgent::fake(['summary']);

        (new AssistantAgent([$childTool]))->prompt('Hi');
        Trail::flush();

        $during = $this->queries;

        expect(($this->rows)())->toBe([0, 0])->and($during)->toBe([]);
    })->with([
        'at a rate of zero' => [fn ($test) => ($test->sampler)(0)],
        'by a filter' => [fn ($test) => Trail::filter(fn () => false)],
    ]);

    it('stays skipped when it fails over, because the second start is not decided again', function () {
        ($this->sampler)(0.5, [0.9, 0.1]);
        FakeAnthropic::script([FakeAnthropic::error(429), FakeAnthropic::text('ok')]);

        (new AssistantAgent)->prompt('Hi', provider: ['anthropic' => 'model-a', 'backup' => 'model-b']);
        Trail::flush();

        expect(($this->rows)())->toBe([0, 0])->and($this->draws)->toBe(1);
    });

    it('stays skipped when its stream is iterated again', function () {
        ($this->sampler)(0.5, [0.9, 0.1]);
        FakeAnthropic::script([FakeAnthropic::text('first try'), FakeAnthropic::text('second try')]);

        $stream = (new AssistantAgent)->stream('Hi');
        Streams::drain($stream, 3);
        Streams::drain($stream);
        Trail::flush();

        expect(($this->rows)())->toBe([0, 0])->and($this->draws)->toBe(1);
    });

    it('is not recorded when it later fails, since the decision came first', function () {
        ($this->sampler)(0.5, [0.9]);
        FakeAnthropic::script([FakeAnthropic::error(500, 'Server error')]);

        expect(fn () => (new AssistantAgent)->prompt('Hi'))->toThrow(RequestException::class);
        Trail::flush();

        expect(($this->rows)())->toBe([0, 0]);
    });
});

it('decides once for a recorded run, so its sub-agent and embeddings call follow it', function () {
    ($this->sampler)(0.5, [0.1, 0.9, 0.9]);
    Embeddings::fake([[[0.1, 0.2]]]);

    $embed = new CallbackTool('embed', fn () => (string) count(Embeddings::for(['a'])->generate()));
    $ask = new CallbackTool('ask', fn () => (new ResearcherAgent([$embed]))->prompt('Dig')->text);

    AssistantAgent::fake([new ToolCall('c1', 'ask', ['query' => 'x']), 'Done']);
    ResearcherAgent::fake([new ToolCall('c2', 'embed', ['query' => 'x']), 'found it']);

    (new AssistantAgent([$ask]))->prompt('Hi');
    Trail::flush();

    expect($this->draws)->toBe(1)
        ->and(DB::table('trail_spans')->orderBy('sequence')->pluck('type')->all())->toBe(['agent', 'step', 'tool', 'agent', 'step', 'tool', 'embedding', 'step', 'step']);
});

describe('a filter that starts runs of its own', function () {
    beforeEach(function () {
        Http::fake(['api.openai.com/*' => Http::response(['data' => [['embedding' => [0.1]]], 'usage' => ['prompt_tokens' => 3]])]);
        $this->calls = 0;

        /** A filter that does something with the SDK, counting its own calls. */
        $this->filtering = fn (Closure $inside, mixed $answer = true) => Trail::filter(function () use ($inside, $answer) {
            // Past a few calls the filter stops doing anything, so a missing guard fails the count below instead of recursing.
            if (++$this->calls <= 3) {
                $inside();
            }

            return $answer;
        });
    });

    it('is not asked again for the agent run it starts, and leaves no rows for it', function () {
        AssistantAgent::fake(['outer']);
        ResearcherAgent::fake(['inner']);
        ($this->filtering)(fn () => (new ResearcherAgent)->prompt('inner'));

        (new AssistantAgent)->prompt('outer');
        Trail::flush();

        expect($this->calls)->toBe(1)
            ->and(DB::table('trail_traces')->pluck('agent_class')->all())->toBe([AssistantAgent::class]);
    });

    it('is not asked again for the embeddings call it makes', function () {
        AssistantAgent::fake(['outer']);
        ($this->filtering)(fn () => Embeddings::for(['a'])->generate());

        (new AssistantAgent)->prompt('outer');
        Trail::flush();

        expect($this->calls)->toBe(1)->and(DB::table('trail_traces')->pluck('type')->all())->toBe(['agent']);
    });

    it('decides the outer run by its answer, and leaves nothing behind when it says no', function () {
        AssistantAgent::fake(['outer']);
        ResearcherAgent::fake(['inner']);
        ($this->filtering)(fn () => (new ResearcherAgent)->prompt('inner'), false);

        (new AssistantAgent)->prompt('outer');
        Trail::flush();

        expect(($this->rows)())->toBe([0, 0]);
    });

    it('gives recording back afterwards, even when the filter throws', function () {
        Exceptions::fake();
        AssistantAgent::fake(['one', 'two']);
        Trail::filter(function () {
            if (++$this->calls <= 3) {
                (new AssistantAgent)->prompt('inner');
            }

            throw new RuntimeException('Filter broke');
        });

        (new AssistantAgent)->prompt('outer');
        Trail::filter(null);
        (new AssistantAgent)->prompt('later');
        Trail::flush();

        expect(DB::table('trail_spans')->where('type', 'agent')->pluck('input')->map(fn ($input) => json_decode($input, true)['prompt'])->sort()->values()->all())->toBe(['later', 'outer']);
    });
});

describe('embeddings on their own', function () {
    beforeEach(function () {
        Http::fake(['api.openai.com/*' => Http::response(['data' => [['embedding' => [0.1]]], 'usage' => ['prompt_tokens' => 3]])]);
    });

    it('are decided on their own, and skipped at a rate of zero', function () {
        ($this->sampler)(0);

        Embeddings::for(['a'])->generate();
        Trail::flush();

        expect(($this->rows)())->toBe([0, 0]);
    });

    it('can be filtered apart from agent runs, in both directions', function () {
        Trail::filter(fn (RecordingCandidate $run) => $run->type === SpanType::Agent);

        Embeddings::for(['a'])->generate();
        ($this->run)();
        Trail::flush();

        expect(DB::table('trail_traces')->pluck('type')->all())->toBe(['agent']);

        DB::table('trail_spans')->delete();
        DB::table('trail_traces')->delete();
        Trail::filter(fn (RecordingCandidate $run) => $run->type === SpanType::Embedding);

        Embeddings::for(['a'])->generate();
        ($this->run)();
        Trail::flush();

        expect(DB::table('trail_traces')->pluck('type')->all())->toBe(['embedding']);
    });

    it('show the filter what an embeddings call is', function () {
        $seen = [];
        Trail::filter(function (RecordingCandidate $run) use (&$seen) {
            $seen[] = $run;

            return true;
        });

        Embeddings::for(['a'])->generate();

        expect($seen)->toHaveCount(1)
            ->and([$seen[0]->type, $seen[0]->agentClass, $seen[0]->agent, $seen[0]->prompt, $seen[0]->provider, $seen[0]->model])
            ->toBe([SpanType::Embedding, null, null, null, 'openai', 'text-embedding-3-small']);
    });
});

describe('the filter', function () {
    it('records one agent class and not another in the same process', function () {
        Trail::filter(fn (RecordingCandidate $run) => $run->agentClass === ResearcherAgent::class);

        AssistantAgent::fake(['one']);
        ResearcherAgent::fake(['two']);
        (new AssistantAgent)->prompt('Hi');
        (new ResearcherAgent)->prompt('Hi');
        Trail::flush();

        expect(DB::table('trail_traces')->pluck('agent_class')->all())->toBe([ResearcherAgent::class]);
    });

    it('shows the candidate the prompt, the user, the provider and the model as they are', function () {
        $seen = [];
        Trail::filter(function (RecordingCandidate $run) use (&$seen) {
            $seen[] = $run;

            return true;
        });

        FakeAnthropic::script([FakeAnthropic::text('ok')]);
        $agent = (new RememberingAgent)->forUser(new ConversationParticipant);
        $agent->prompt('My key is sk-ant-api03-PromptSecret0123456789abcdefghij', model: FakeAnthropic::MODEL);

        expect($seen)->toHaveCount(1)
            ->and($seen[0]->type)->toBe(SpanType::Agent)
            ->and($seen[0]->agentClass)->toBe(RememberingAgent::class)
            ->and($seen[0]->agent)->toBe($agent)
            ->and($seen[0]->prompt)->toBe('My key is sk-ant-api03-PromptSecret0123456789abcdefghij')
            ->and([$seen[0]->userId, $seen[0]->userType])->toBe(['42', ConversationParticipant::class])
            ->and([$seen[0]->provider, $seen[0]->model])->toBe(['anthropic', FakeAnthropic::MODEL]);
    });

    it('sees no class for an anonymous agent', function () {
        $seen = null;
        Trail::filter(function (RecordingCandidate $run) use (&$seen) {
            $seen = $run;

            return true;
        });

        FakeAnthropic::script([FakeAnthropic::text('ok')]);
        (new class extends AssistantAgent {})->prompt('Hi');

        expect($seen->agentClass)->toBeNull()->and($seen->agent)->not->toBeNull();
    });

    it('skips only on false, and records on anything else', function (mixed $answer, int $expected) {
        Trail::filter(fn () => $answer);

        ($this->run)();
        Trail::flush();

        expect(($this->rows)()[0])->toBe($expected);
    })->with([[false, 0], [null, 1], [0, 1], ['', 1], [true, 1]]);

    it('records the run and reports the error when the filter throws', function () {
        Exceptions::fake();
        Trail::filter(fn () => throw new RuntimeException('Filter broke'));

        $response = ($this->run)();
        Trail::flush();

        expect($response->text)->toBe('Hello')->and(($this->rows)()[0])->toBe(1);
        Exceptions::assertReported(fn (RuntimeException $e) => $e->getMessage() === 'Filter broke');
    });

    it('can be cleared', function () {
        Trail::filter(fn () => false);
        Trail::filter(null);

        ($this->run)();
        Trail::flush();

        expect(($this->rows)()[0])->toBe(1);
    });
});

describe('withoutRecording', function () {
    it('records nothing inside, and returns what the callback returns', function () {
        $result = Trail::withoutRecording(function () {
            ($this->run)();

            return 'result';
        });
        Trail::flush();

        expect($result)->toBe('result')->and(($this->rows)())->toBe([0, 0]);
    });

    it('nests, and restores recording after an exception', function () {
        Trail::withoutRecording(function () {
            Trail::withoutRecording(fn () => ($this->run)('inner'));
            ($this->run)('still outside');
        });

        try {
            Trail::withoutRecording(fn () => throw new RuntimeException('boom'));
        } catch (RuntimeException) {
            // The depth is restored all the same.
        }

        ($this->run)('after');
        Trail::flush();

        expect(DB::table('trail_spans')->where('type', 'agent')->pluck('input')->map(fn ($input) => json_decode($input, true)['prompt'])->all())->toBe(['after']);
    });

    it('keeps a run that started inside unrecorded after the callback returned', function () {
        FakeAnthropic::script([FakeAnthropic::text('ok')]);

        $stream = Trail::withoutRecording(function () {
            $stream = (new AssistantAgent)->stream('Hi');
            Streams::drain($stream, 3);

            return $stream;
        });

        // Finishing outside the callback: the run began inside it and stays skipped.
        FakeAnthropic::script([FakeAnthropic::text('ok')]);
        Streams::drain($stream);
        Trail::flush();

        expect(($this->rows)())->toBe([0, 0]);
    });

    it('records a stream that was created inside and first iterated outside', function () {
        FakeAnthropic::script([FakeAnthropic::text('ok')]);

        $stream = Trail::withoutRecording(fn () => (new AssistantAgent)->stream('Hi'));
        Streams::drain($stream);
        Trail::flush();

        expect(($this->rows)()[0])->toBe(1);
    });
});

describe('withoutRecording inside a recorded run', function () {
    it('leaves out a sub-agent started inside it, but keeps the tool that started it', function () {
        config(['trail.pricing.anthropic' => [FakeAnthropic::MODEL => ['input' => 3.0, 'output' => 15.0], 'claude-sonnet-5-5' => ['input' => 4.0, 'output' => 20.0]]]);
        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'ask', 'input' => []]], usage: ['input_tokens' => 100, 'output_tokens' => 20]),
            FakeAnthropic::text('found it', usage: ['input_tokens' => 50, 'output_tokens' => 10]),
            FakeAnthropic::text('Done', usage: ['input_tokens' => 7, 'output_tokens' => 3]),
        ]);

        $ask = new CallbackTool('ask', fn () => Trail::withoutRecording(fn () => (new ResearcherAgent)->prompt('Dig')->text));

        (new AssistantAgent([$ask]))->prompt('Hi', model: FakeAnthropic::MODEL);
        Trail::flush();

        $spans = DB::table('trail_spans')->orderBy('sequence')->get();

        expect($spans->pluck('type')->all())->toBe(['agent', 'step', 'tool', 'step'])
            ->and(json_decode($spans[2]->output, true))->toBe(['result' => 'found it'])
            ->and($spans[2]->status)->toBe('completed')
            ->and(DB::table('trail_traces')->first()->input_tokens)->toBe(107);
    });

    it('leaves out an embeddings call made inside it', function () {
        Http::fake(['api.openai.com/*' => Http::response(['data' => [['embedding' => [0.1]]], 'usage' => ['prompt_tokens' => 9]])]);
        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'embed', 'input' => []]], usage: ['input_tokens' => 100, 'output_tokens' => 20]),
            FakeAnthropic::text('Done', usage: ['input_tokens' => 7, 'output_tokens' => 3]),
        ]);

        $embed = new CallbackTool('embed', fn () => Trail::withoutRecording(fn () => (string) count(Embeddings::for(['a'])->generate())));

        (new AssistantAgent([$embed]))->prompt('Hi', model: FakeAnthropic::MODEL);
        Trail::flush();

        expect(DB::table('trail_spans')->orderBy('sequence')->pluck('type')->all())->toBe(['agent', 'step', 'tool', 'step'])
            ->and(DB::table('trail_traces')->first()->input_tokens)->toBe(107);
    });

    it('keeps a skipped sub-agent skipped when its stream is iterated outside, and its own children with it', function () {
        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'ask', 'input' => []]]),
            FakeAnthropic::text('first try'),
            FakeAnthropic::text('Done'),
            FakeAnthropic::text('second try'),
        ]);

        $child = null;
        $ask = new CallbackTool('ask', function () use (&$child) {
            Trail::withoutRecording(function () use (&$child) {
                $child = (new ResearcherAgent)->stream('Dig');
                Streams::drain($child, 3);
            });

            return 'abandoned';
        });

        (new AssistantAgent([$ask]))->prompt('Hi');
        Streams::drain($child);
        Trail::flush();

        expect(DB::table('trail_spans')->pluck('type')->sort()->values()->all())->toBe(['agent', 'step', 'step', 'tool']);
    });
});

describe('pausing', function () {
    it('skips new runs while paused and records them again once resumed and flushed', function () {
        Artisan::call('trail:pause');

        ($this->run)('paused');
        Trail::flush();

        expect(($this->rows)())->toBe([0, 0]);

        Artisan::call('trail:resume');
        Trail::flush();

        ($this->run)('resumed');
        Trail::flush();

        expect(($this->rows)()[0])->toBe(1);
    });

    it('prints what the commands do', function () {
        $this->artisan('trail:pause')->expectsOutputToContain('Recording paused')->assertSuccessful();
        $this->artisan('trail:resume')->expectsOutputToContain('Recording resumed')->assertSuccessful();
    });

    it('lets a run that was already in flight finish recording completely', function () {
        $tool = new CallbackTool('lookup', function () {
            Artisan::call('trail:pause');

            return 'ok';
        });

        AssistantAgent::fake([new ToolCall('c1', 'lookup', ['query' => 'x']), 'Done']);
        (new AssistantAgent([$tool]))->prompt('Hi');
        Trail::flush();

        expect(($this->rows)())->toBe([1, 4])
            ->and(DB::table('trail_traces')->value('status'))->toBe('completed');
    });

    it('follows the flag it last read until the flush, and sees the pause after it', function () {
        // The first run reads the flag, which is not set. The pause comes in the middle of the request.
        ($this->run)('first');
        Artisan::call('trail:pause');

        ($this->run)('same cycle');
        Trail::flush();

        expect(($this->rows)()[0])->toBe(2);

        ($this->run)('next cycle');
        Trail::flush();

        expect(($this->rows)()[0])->toBe(2);
    });

    it('records and reports when the cache cannot be read', function () {
        Exceptions::fake();
        $this->app->instance(CacheFactory::class, new BrokenCache);
        $this->app->forgetInstance(Sampler::class);

        ($this->run)();
        Trail::flush();

        Exceptions::assertReportedCount(1);
        expect(($this->rows)()[0])->toBe(1);
    });
});

describe('reading who a run belongs to', function () {
    beforeEach(function () {
        $this->asked = function (Closure $setup) {
            CountingParticipantAgent::$asked = 0;
            $setup();
            FakeAnthropic::script([FakeAnthropic::text('ok')]);

            (new CountingParticipantAgent)->forUser(new ConversationParticipant)->prompt('Hi');
            Trail::flush();

            return CountingParticipantAgent::$asked;
        };
    });

    it('asks the agent nothing for a run that is skipped with no filter, and no more with a filter than without', function () {
        $skipped = ($this->asked)(fn () => ($this->sampler)(0));
        $baseline = $skipped;

        $recorded = ($this->asked)(fn () => ($this->sampler)(1));
        $filtered = ($this->asked)(function () {
            ($this->sampler)(1);
            Trail::filter(fn () => true);
        });

        // Trail reads at the start of a run and at its end; the rest is the SDK's own.
        expect($recorded - $baseline)->toBe(2)
            ->and($filtered)->toBeLessThanOrEqual($recorded);
    });
});

describe('what a run costs', function () {
    it('issues one query and begins no transaction when recorded, and none when skipped', function () {
        $this->app->forgetInstance(Sampler::class);

        Transactions::outside(function () {
            $began = 0;
            Event::listen(TransactionBeginning::class, function () use (&$began) {
                $began++;
            });
            $this->queries = [];

            ($this->run)();

            expect($this->queries)->toHaveCount(1)
                ->and($this->queries[0])->toMatch('/^insert into ["`]?trail_traces/i')
                ->and($began)->toBe(0);

            Trail::flush();
            $this->queries = [];
            $began = 0;

            Trail::filter(fn () => false);
            ($this->run)();

            expect($this->queries)->toBe([])->and($began)->toBe(0);
        });
    });
});

describe('the memory of skipped runs', function () {
    it('forgets a skipped run at the flush, and forgets the oldest once there are too many', function () {
        ($this->sampler)(0.5, [0.9, 0.9, 0.9, 0.1, 0.1, 0.1]);
        $this->app->instance(Recorder::class, new Recorder($this->app, $this->app->make(CostCalculator::class), maxSkippedIds: 2));

        foreach (['A', 'B', 'C'] as $prompt) {
            ($this->run)($prompt);
        }

        [$a, $b, $c] = array_map(fn ($entry) => $entry->event, $this->sdk->of(PromptingAgent::class));

        // C is remembered, so its start is ignored without a decision. A was dropped to make room, so it is decided afresh.
        event($c);
        $drawsAfterC = $this->draws;
        event($a);

        expect($drawsAfterC)->toBe(3)->and($this->draws)->toBe(4);

        Trail::flush();

        expect(DB::table('trail_traces')->pluck('id')->all())->toBe([$a->invocationId]);

        // After the flush nothing is remembered: B is decided again.
        event($b);
        Trail::flush();

        expect(DB::table('trail_traces')->pluck('id')->sort()->values()->all())->toBe(collect([$a->invocationId, $b->invocationId])->sort()->values()->all());
    });
});

describe('with Trail::fake()', function () {
    it('lets a filtered-out run miss the fake and a recorded one reach it', function () {
        $fake = Trail::fake();
        Trail::filter(fn (RecordingCandidate $run) => $run->prompt === 'keep');

        ($this->run)('skip');
        ($this->run)('keep');
        Trail::flush();

        $fake->assertRecordedCount(1);
    });
});

it('records the run and reports the failure when the decision itself breaks', function () {
    Exceptions::fake();
    $this->app->instance(Sampler::class, new ThrowingSampler($this->app->make('config'), $this->app->make(CacheFactory::class)));

    $response = ($this->run)();
    Trail::flush();

    Exceptions::assertReported(fn (RuntimeException $e) => $e->getMessage() === 'The decision failed.');
    expect($response->text)->toBe('Hello')->and(($this->rows)()[0])->toBe(1);
});

describe('the pause and resume commands', function () {
    it('warn that the flag stays in this process when the cache store cannot share it', function (string $store) {
        config(['cache.stores.null' => ['driver' => 'null'], 'cache.default' => $store]);

        $this->artisan('trail:pause')->expectsOutputToContain('only affects the current process')->assertSuccessful();
        $this->artisan('trail:resume')->expectsOutputToContain('only affects the current process')->assertSuccessful();
    })->with(['array', 'null']);

    it('do not warn for a store that processes share', function () {
        config(['cache.default' => 'file']);

        $this->artisan('trail:pause')->doesntExpectOutputToContain('only affects')->assertSuccessful();
        $this->artisan('trail:resume')->assertSuccessful();
    });
});
