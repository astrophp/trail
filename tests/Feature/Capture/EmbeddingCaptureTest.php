<?php

use Astro\Trail\Capture\Recorder;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Pricing\CostCalculator;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Capture\Captured;
use Astro\Trail\Tests\Fixtures\Capture\Failures;
use Astro\Trail\Tests\Fixtures\Capture\Streams;
use Astro\Trail\Tests\Fixtures\Capture\ThrowingRecorder;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Storage\DatabaseStoreProbe;
use Astro\Trail\Tests\Fixtures\Tools\CallbackTool;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Route;
use Laravel\Ai\Embeddings;
use Laravel\Ai\Events\EmbeddingsGenerated;
use Laravel\Ai\Events\GeneratingEmbeddings;
use Laravel\Ai\Events\InvokingTool;

/*
|--------------------------------------------------------------------------
| How embeddings calls are stored
|--------------------------------------------------------------------------
|
| An embeddings call made inside a tool is a span under that tool call. One made
| anywhere else is a trace of its own. A failed call fires no event, so it is
| found out from the tool that made it, or not at all.
|
*/

beforeEach(function () {
    $this->inserts = 0;
    DB::listen(function ($query) {
        if (preg_match('/^insert into ["`]?trail_traces/i', $query->sql) === 1) {
            $this->inserts++;
        }
    });

    config(['trail.pricing' => [
        'anthropic' => [FakeAnthropic::MODEL => ['input' => 3.0, 'output' => 15.0]],
        'openai' => ['text-embedding-3-small' => ['input' => 2.0]],
    ]]);

    $this->openai = fn (array $overrides = []) => Http::fake(['api.openai.com/*' => Http::response($overrides + [
        'data' => [['embedding' => [0.1, 0.2]], ['embedding' => [0.3, 0.4]]],
        'usage' => ['prompt_tokens' => 7, 'total_tokens' => 7],
    ])]);

    $this->embedTool = fn () => new CallbackTool('embed', fn () => (string) count(Embeddings::for(['a', 'b'])->generate()));

    $this->parentScript = fn () => FakeAnthropic::script([
        FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'embed', 'input' => ['query' => 'x']]], usage: ['input_tokens' => 100, 'output_tokens' => 20]),
        FakeAnthropic::text('Done', usage: ['input_tokens' => 7, 'output_tokens' => 3]),
    ]);

    $this->stored = function (): Captured {
        Trail::flush();

        return Captured::read($this->sdk->invocationIds()[0]);
    };
});

describe('inside a tool', function () {
    it('is a span under the tool call, with its tokens and cost counted in the trace', function () {
        ($this->openai)();
        ($this->parentScript)();

        (new AssistantAgent([($this->embedTool)()]))->prompt('Hi', model: FakeAnthropic::MODEL);
        $run = ($this->stored)()->assertVolatileColumns();

        $toolId = $this->sdk->sole(InvokingTool::class)->event->toolInvocationId;
        $embeddingsId = $this->sdk->sole(GeneratingEmbeddings::class)->invocationId;
        $embedding = $run->rawSpans()[3];

        // Steps: 100 x 3 + 20 x 15, and 7 x 3 + 3 x 15. Embeddings: 7 x 2 (per million tokens).
        expect($run->outline([$this->sdk->invocationIds()[0] => 'parent', $toolId => 'tool']))->toBe([
            ['agent', 'AssistantAgent', null, 1, 1, 'completed'],
            ['step', 'step', 'parent', 1, 2, 'completed'],
            ['tool', 'embed', 'parent', 1, 3, 'completed'],
            ['embedding', 'embeddings', 'tool', 1, 4, 'completed'],
            ['step', 'step', 'parent', 1, 5, 'completed'],
        ])->and($embedding['id'])->toBe($embeddingsId)
            ->and([$embedding['provider'], $embedding['model'], $embedding['responding_model']])->toBe(['openai', 'text-embedding-3-small', null])
            ->and($embedding['input'])->toBe(['count' => 2, 'dimensions' => 1536])
            ->and($embedding['output'])->toBe(['count' => 2])
            ->and([$embedding['input_tokens'], $embedding['output_tokens'], $embedding['cache_read_tokens'], $embedding['cache_write_tokens'], $embedding['reasoning_tokens']])->toBe([7, null, null, null, null])
            ->and($embedding['cost'])->toBe(0.000014)
            ->and($embedding['duration_ms'])->toBeFloat()->toBeGreaterThan(0.0)
            ->and(Captured::pick([$run->trace()], ['input_tokens', 'output_tokens', 'cost', 'span_count', 'unpriced_span_count'])[0])
            ->toBe(['input_tokens' => 114, 'output_tokens' => 23, 'cost' => '0.0006800000', 'span_count' => 5, 'unpriced_span_count' => 0]);
    });

    it('stores no token count when the provider reports none, and counts the span as neither priced nor unpriced', function () {
        ($this->openai)(['usage' => null]);
        ($this->parentScript)();

        (new AssistantAgent([($this->embedTool)()]))->prompt('Hi', model: FakeAnthropic::MODEL);
        $run = ($this->stored)();

        $embedding = $run->rawSpans()[3];

        expect([$embedding['input_tokens'], $embedding['cost']])->toBe([null, null])
            ->and($embedding['status'])->toBe('completed')
            ->and(Captured::pick([$run->trace()], ['input_tokens', 'unpriced_span_count'])[0])->toBe(['input_tokens' => 107, 'unpriced_span_count' => 0]);
    });

    it('nests the same way under a streamed parent', function () {
        ($this->openai)();
        ($this->parentScript)();

        Streams::drain((new AssistantAgent([($this->embedTool)()]))->stream('Hi', model: FakeAnthropic::MODEL));
        $run = ($this->stored)()->assertVolatileColumns();

        expect(array_column($run->rawSpans(), 'type'))->toBe(['agent', 'step', 'tool', 'embedding', 'step'])
            ->and($run->rawSpans()[3]['parent_id'])->toBe($run->spanId(2))
            ->and($run->trace()['streamed'])->toBeTrue();
    });
});

describe('on its own', function () {
    it('is a trace of its own, inserted when the call starts and completed at the flush', function () {
        ($this->openai)();
        Route::get('/embed', function () {
            Embeddings::for(['a', 'b'])->generate();

            return 'ok';
        });

        $this->get('/embed')->assertOk();

        $id = DB::table('trail_traces')->value('id');
        $run = Captured::read($id)->assertVolatileColumns();

        expect($this->inserts)->toBe(1)
            ->and($run->rawTrace()['type'])->toBe('embedding')
            ->and(Captured::pick([$run->trace()], ['name', 'status', 'provider', 'model', 'input_tokens', 'cost', 'span_count', 'unpriced_span_count', 'agent_class'])[0])
            ->toBe(['name' => 'Embeddings', 'status' => 'completed', 'provider' => 'openai', 'model' => 'text-embedding-3-small', 'input_tokens' => 7, 'cost' => '0.0000140000', 'span_count' => 1, 'unpriced_span_count' => 0, 'agent_class' => null])
            ->and(Captured::pick($run->spans(), ['type', 'parent_id', 'sequence', 'status']))->toBe([['type' => 'embedding', 'parent_id' => null, 'sequence' => 1, 'status' => 'completed']]);
    });

    it('writes the start row before the call returns, with the span id equal to the trace id', function () {
        ($this->openai)();
        $seen = null;

        Event::listen(EmbeddingsGenerated::class, function ($event) use (&$seen) {
            $seen = [$event->invocationId, DB::table('trail_traces')->where('id', $event->invocationId)->value('status')];
        });

        Embeddings::for(['a'])->generate();
        $id = $this->sdk->sole(GeneratingEmbeddings::class)->invocationId;

        expect($seen)->toBe([$id, 'running']);

        Trail::flush();

        expect(Captured::read($id)->spanId(0))->toBe($id);
    });

    it('is unpriced, and counted as such, when its model has no price', function () {
        ($this->openai)();

        Embeddings::for(['a'])->generate(model: 'text-embedding-unpriced');
        $id = $this->sdk->sole(GeneratingEmbeddings::class)->invocationId;
        Trail::flush();
        $run = Captured::read($id);

        expect(Captured::pick([$run->trace()], ['input_tokens', 'cost', 'unpriced_span_count'])[0])->toBe(['input_tokens' => 7, 'cost' => null, 'unpriced_span_count' => 1]);
    });

    it('is standalone when made after the tool returned', function () {
        ($this->openai)();
        ($this->parentScript)();

        (new AssistantAgent([($this->embedTool)()]))->prompt('Hi', model: FakeAnthropic::MODEL);
        Embeddings::for(['after'])->generate();
        Trail::flush();

        expect(DB::table('trail_traces')->orderBy('started_at')->pluck('type')->all())->toBe(['agent', 'embedding'])
            ->and(DB::table('trail_spans')->where('type', 'embedding')->count())->toBe(2);
    });

    it('records nothing for a response served from the embeddings cache', function () {
        config(['ai.caching.embeddings.cache' => true, 'ai.caching.embeddings.store' => 'array']);
        ($this->openai)(['data' => [['embedding' => [0.1, 0.2]]]]);

        Embeddings::for(['a'])->generate();
        Embeddings::for(['a'])->generate();
        Trail::flush();

        expect((new DatabaseStoreProbe)->traceCount())->toBe(1);
    });
});

describe('when the call fails', function () {
    beforeEach(function () {
        Http::fake(['api.openai.com/*' => Http::response(['error' => ['message' => 'bad']], 500)]);
    });

    it('is failed with the tool\'s error when the tool fails', function () {
        ($this->parentScript)();

        Failures::thrown(fn () => (new AssistantAgent([($this->embedTool)()]))->prompt('Hi', model: FakeAnthropic::MODEL));
        $run = ($this->stored)()->assertVolatileColumns(untimed: [3]);

        expect(Captured::pick($run->spans(), ['type', 'status', 'issue_kind', 'error_class', 'error_source', 'error_http_status']))->toBe([
            ['type' => 'agent', 'status' => 'failed', 'issue_kind' => 'tool_error', 'error_class' => RequestException::class, 'error_source' => 'tool', 'error_http_status' => 500],
            ['type' => 'step', 'status' => 'completed', 'issue_kind' => null, 'error_class' => null, 'error_source' => null, 'error_http_status' => null],
            ['type' => 'tool', 'status' => 'failed', 'issue_kind' => 'tool_error', 'error_class' => RequestException::class, 'error_source' => 'tool', 'error_http_status' => 500],
            ['type' => 'embedding', 'status' => 'failed', 'issue_kind' => 'tool_error', 'error_class' => RequestException::class, 'error_source' => 'tool', 'error_http_status' => 500],
        ])->and($run->trace()['status'])->toBe('failed');
    });

    it('is failed with no error when the tool catches it and the run completes', function () {
        ($this->parentScript)();

        $tool = new CallbackTool('embed', function () {
            try {
                Embeddings::for(['a'])->generate();
            } catch (Throwable) {
                return 'caught';
            }

            return 'unreachable';
        });

        (new AssistantAgent([$tool]))->prompt('Hi', model: FakeAnthropic::MODEL);
        $run = ($this->stored)()->assertVolatileColumns(untimed: [3]);

        expect(Captured::pick($run->spans(), ['type', 'status', 'issue_kind', 'error_class', 'error_message', 'error_source', 'error_http_status']))->toBe([
            ['type' => 'agent', 'status' => 'completed', 'issue_kind' => null, 'error_class' => null, 'error_message' => null, 'error_source' => null, 'error_http_status' => null],
            ['type' => 'step', 'status' => 'completed', 'issue_kind' => null, 'error_class' => null, 'error_message' => null, 'error_source' => null, 'error_http_status' => null],
            ['type' => 'tool', 'status' => 'completed', 'issue_kind' => null, 'error_class' => null, 'error_message' => null, 'error_source' => null, 'error_http_status' => null],
            ['type' => 'embedding', 'status' => 'failed', 'issue_kind' => null, 'error_class' => null, 'error_message' => null, 'error_source' => null, 'error_http_status' => null],
            ['type' => 'step', 'status' => 'completed', 'issue_kind' => null, 'error_class' => null, 'error_message' => null, 'error_source' => null, 'error_http_status' => null],
        ])->and($run->trace()['status'])->toBe('completed');
    });

    it('stays running when it is standalone, for the sweep to find', function () {
        Failures::thrown(fn () => Embeddings::for(['a'])->generate());
        $id = $this->sdk->sole(GeneratingEmbeddings::class)->invocationId;
        Trail::flush();
        $run = Captured::read($id);

        expect($run->rawTrace()['status'])->toBe('running')
            ->and($run->rawTrace()['ended_at'])->toBeNull()
            ->and(Captured::pick($run->spans(), ['status', 'issue_kind']))->toBe([['status' => 'running', 'issue_kind' => null]])
            ->and($run->rawSpans()[0]['ended_at'])->toBeNull();
    });
});

it('lets embeddings return their result when every Trail listener throws', function () {
    ($this->openai)();
    Exceptions::fake();
    $this->app->instance(Recorder::class, new ThrowingRecorder($this->app, $this->app->make(CostCalculator::class)));

    $response = Embeddings::for(['a'])->generate();

    expect($response->embeddings)->toHaveCount(2);

    Exceptions::assertReported(fn (RuntimeException $e) => $e->getMessage() === 'embeddingsGenerating failed');
    Exceptions::assertReported(fn (TypeError $e) => $e->getMessage() === 'embeddingsGenerated failed');
});
