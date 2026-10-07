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
use Astro\Trail\Tests\Fixtures\Tools\ApprovalTool;
use Astro\Trail\Tests\Fixtures\Tools\LookupTool;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Exceptions;
use Laravel\Ai\Events\AgentPrompted;
use Laravel\Ai\Events\PromptingAgent;
use Laravel\Ai\Events\StreamingAgent;
use Laravel\Ai\Exceptions\RateLimitedException;
use Laravel\Ai\Exceptions\StreamErrorException;
use Laravel\Ai\Responses\AgentResponse;
use Laravel\Ai\Responses\Data\Meta;
use Laravel\Ai\Responses\Data\TextUsage;

/*
|--------------------------------------------------------------------------
| How streamed runs are stored
|--------------------------------------------------------------------------
|
| A streamed run is driven by its consumer: its steps record as the consumer
| iterates, and a stream that is abandoned never fires a terminal event.
|
*/

beforeEach(function () {
    $this->providers = ['anthropic' => 'model-a', 'backup' => 'model-b'];

    $this->stored = function (): Captured {
        Trail::flush();

        return Captured::read($this->sdk->invocationIds()[0]);
    };

    /** The number of trace inserts issued so far in this test. */
    $this->inserts = 0;
    DB::listen(function ($query) {
        if (preg_match('/^insert into ["`]?trail_traces/i', $query->sql) === 1) {
            $this->inserts++;
        }
    });

    $this->toolScript = fn () => FakeAnthropic::script([
        FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'x']]], usage: ['input_tokens' => 100, 'output_tokens' => 20], text: 'Let me look'),
        FakeAnthropic::text('Done now', usage: ['input_tokens' => 7, 'output_tokens' => 3], model: 'claude-test-responding'),
    ]);
});

describe('a streamed run that completes', function () {
    beforeEach(function () {
        config(['trail.pricing.anthropic' => [
            FakeAnthropic::MODEL => ['input' => 3.0, 'output' => 15.0],
            'claude-test-responding' => ['input' => 10.0, 'output' => 50.0],
        ]]);
    });

    it('stores streamed steps without a responding model and prices them at the requested model', function () {
        ($this->toolScript)();

        $stream = (new AssistantAgent([new LookupTool]))->stream('Hi', model: FakeAnthropic::MODEL);
        Streams::drain($stream);
        $run = ($this->stored)()->assertVolatileColumns();
        $spans = $run->spans();

        // Step 1 is priced at the requested model: 7 x 3 + 3 x 15 per million, not at the responding model's rates.
        expect($run->trace()['streamed'])->toBeTrue()
            ->and(Captured::pick([$run->trace()], Failures::TRACE)[0])->toBe(Failures::trace('completed', false, 4, [], [
                'input_tokens' => 107, 'output_tokens' => 23, 'cost' => '0.0006660000',
            ]))->and(Captured::pick($spans, [...Failures::SPAN, 'model', 'responding_model']))->toBe([
                Failures::span('agent', 1, null, 'completed', [], ['model' => FakeAnthropic::MODEL, 'responding_model' => null]),
                Failures::span('step', 1, 0, 'completed', [], ['input_tokens' => 100, 'output_tokens' => 20, 'cost' => '0.0006000000', 'model' => FakeAnthropic::MODEL, 'responding_model' => null]),
                Failures::span('tool', 1, null, 'completed', [], ['model' => null, 'responding_model' => null]),
                Failures::span('step', 1, 1, 'completed', [], ['input_tokens' => 7, 'output_tokens' => 3, 'cost' => '0.0000660000', 'model' => FakeAnthropic::MODEL, 'responding_model' => null]),
            ])->and($spans[2]['output'])->toBe(['result' => 'Result for x']);
    });

    it('stores the same script run plain as not streamed, with the responding model', function () {
        ($this->toolScript)();

        $response = (new AssistantAgent([new LookupTool]))->prompt('Hi', model: FakeAnthropic::MODEL);
        Trail::flush();
        $run = Captured::read($response->invocationId);

        expect($run->trace()['streamed'])->toBeFalse()
            ->and($run->spans()[3]['responding_model'])->toBe('claude-test-responding')
            ->and($run->spans()[3]['cost'])->toBe('0.0002200000');
    });

    it('stores a streamed run without tools', function () {
        FakeAnthropic::script([FakeAnthropic::text('Hello there', model: 'claude-test-responding')]);

        Streams::drain((new AssistantAgent)->stream('Hi', model: FakeAnthropic::MODEL));
        $run = ($this->stored)()->assertVolatileColumns();

        expect($run->trace()['streamed'])->toBeTrue()
            ->and($run->trace()['status'])->toBe('completed')
            ->and(array_column($run->spans(), 'responding_model'))->toBe([null, null])
            ->and($run->spans()[0]['output'])->toBe(['text' => 'Hello there']);
    });

    it('stores the same answer text for a plain and a streamed run of the same script', function () {
        ($this->toolScript)();
        $plain = (new AssistantAgent([new LookupTool]))->prompt('Hi', model: FakeAnthropic::MODEL);

        ($this->toolScript)();
        $stream = (new AssistantAgent([new LookupTool]))->stream('Hi', model: FakeAnthropic::MODEL);
        Streams::drain($stream);

        Trail::flush();

        // The plain response's text is the last step's; the streamed one joins every step's.
        expect($plain->text)->toBe('Done now')
            ->and($stream->text)->toBe("Let me look\n\nDone now")
            ->and(Captured::read($plain->invocationId)->spans()[0]['output']['text'])->toBe('Done now')
            ->and(Captured::read($stream->invocationId)->spans()[0]['output']['text'])->toBe('Done now');
    });

    it('records a streamed run exactly once, with one early insert', function () {
        FakeAnthropic::script([FakeAnthropic::text('Hello')]);

        Streams::drain((new AssistantAgent)->stream('Hi'));

        expect($this->inserts)->toBe(1);

        $run = ($this->stored)();

        expect((new DatabaseStoreProbe)->traceCount())->toBe(1)
            ->and(array_column($run->spans(), 'type'))->toBe(['agent', 'step']);
    });

    it('records a drained stream that is iterated again as nothing new', function () {
        FakeAnthropic::script([FakeAnthropic::text('Hello')]);

        $stream = (new AssistantAgent)->stream('Hi');
        Streams::drain($stream);
        Streams::drain($stream);

        $run = ($this->stored)();

        expect(array_column($run->spans(), 'attempt'))->toBe([1, 1])
            ->and($run->trace()['span_count'])->toBe(2)
            ->and($run->trace()['status'])->toBe('completed');
    });
});

it('records nothing, not even an early insert, for a stream that is never iterated', function () {
    $anthropic = FakeAnthropic::script([FakeAnthropic::text('Hello')]);

    $stream = (new AssistantAgent)->stream('Hi');
    unset($stream);
    Trail::flush();

    expect($this->inserts)->toBe(0)
        ->and((new DatabaseStoreProbe)->traceCount())->toBe(0)
        ->and($anthropic->urls())->toBe([]);
});

it('ends a streamed run that pauses for approval as awaiting approval', function () {
    FakeAnthropic::script([FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'delete_records', 'input' => ['table' => 'users']]])]);

    $stream = (new AssistantAgent([new ApprovalTool]))->withMessages([])->stream('Delete the users', model: FakeAnthropic::MODEL);
    Streams::drain($stream);
    $run = ($this->stored)();

    expect($run->trace()['status'])->toBe('awaiting_approval')
        ->and(array_column($run->spans(), 'status'))->toBe(['awaiting_approval', 'completed']);
});

describe('a streamed run that fails', function () {
    it('fails over before anything was yielded, and is recovered', function () {
        FakeAnthropic::script([FakeAnthropic::error(429, 'Slow down'), FakeAnthropic::text('ok')]);

        Streams::drain((new AssistantAgent)->stream('Hi', provider: $this->providers));
        $run = ($this->stored)()->assertVolatileColumns();

        $limited = Captured::failure('rate_limited', RateLimitedException::class, 'Application rate limited by AI provider [anthropic].', 'step', 429);

        expect($run->trace()['streamed'])->toBeTrue()
            ->and(Captured::pick([$run->trace()], Failures::TRACE)[0]['recovered'])->toBeTrue()
            ->and(Captured::pick($run->spans(), Failures::SPAN))->toBe([
                Failures::span('agent', 2, null, 'completed'),
                Failures::span('step', 1, 0, 'failed', $limited),
                Failures::span('step', 2, 0, 'completed', [], ['input_tokens' => 10, 'output_tokens' => 5]),
            ]);
    });

    it('is terminal once output was yielded, and never calls the second provider', function () {
        config(['trail.pricing.anthropic' => ['model-a' => ['input' => 3.0, 'output' => 15.0]]]);
        $anthropic = FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'x']]], usage: ['input_tokens' => 100, 'output_tokens' => 20]),
            FakeAnthropic::error(429),
            FakeAnthropic::text('never used'),
        ]);

        [, $failure] = Streams::drain((new AssistantAgent([new LookupTool]))->stream('Hi', provider: $this->providers));
        $run = ($this->stored)()->assertVolatileColumns();

        $limited = Captured::failure('rate_limited', RateLimitedException::class, 'Application rate limited by AI provider [anthropic].', 'step', 429);

        expect($failure)->toBeInstanceOf(RateLimitedException::class)
            ->and($anthropic->urls())->toBe(['https://api.anthropic.com/v1/messages', 'https://api.anthropic.com/v1/messages'])
            ->and(Captured::pick([$run->trace()], Failures::TRACE)[0])->toBe(Failures::trace('failed', false, 4, $limited, [
                'input_tokens' => 100, 'output_tokens' => 20, 'cost' => '0.0006000000',
            ]))->and(Captured::pick($run->spans(), Failures::SPAN))->toBe([
                Failures::span('agent', 1, null, 'failed', $limited),
                Failures::span('step', 1, 0, 'completed', [], ['input_tokens' => 100, 'output_tokens' => 20, 'cost' => '0.0006000000']),
                Failures::span('tool', 1, null, 'completed'),
                Failures::span('step', 1, 1, 'failed', $limited),
            ]);
    });

    it('stores a provider error event inside the stream as a plain exception, with no failover', function () {
        $anthropic = FakeAnthropic::script([FakeAnthropic::streamError('partial text'), FakeAnthropic::text('never used')]);

        Streams::drain((new AssistantAgent)->stream('Hi', provider: $this->providers));
        $run = ($this->stored)()->assertVolatileColumns();

        $failure = Captured::failure('exception', StreamErrorException::class, 'Overloaded', 'step', null);

        expect(count($anthropic->urls()))->toBe(1)
            ->and(Captured::pick([$run->trace()], Failures::TRACE)[0])->toBe(Failures::trace('failed', false, 2, $failure))
            ->and(Captured::pick($run->spans(), Failures::SPAN))->toBe([
                Failures::span('agent', 1, null, 'failed', $failure),
                Failures::span('step', 1, 0, 'failed', $failure),
            ]);
    });
});

describe('a stream the consumer abandons', function () {
    // The stop points of the SDK's own abandoned-stream test: events handed to the consumer before it stopped.
    it('is flushed as running with exactly the spans seen so far', function (int $stopAfter, array $spans) {
        $id = Streams::abandonedAfter($stopAfter);
        gc_collect_cycles();

        Trail::flush();
        $run = Captured::read($id);

        expect($run->trace()['status'])->toBe('running')
            ->and([$run->rawTrace()['ended_at'], $run->rawTrace()['duration_ms'], $run->rawTrace()['error_class']])->toBe([null, null, null])
            ->and(Captured::pick($run->spans(), ['type', 'status']))->toBe(array_map(fn (array $span) => ['type' => $span[0], 'status' => $span[1]], $spans))
            ->and($run->rawSpans()[0]['ended_at'])->toBeNull();

        $queries = 0;
        DB::listen(function () use (&$queries) {
            $queries++;
        });
        Trail::flush();

        expect($queries)->toBe(0);
    })->with([
        'before the first step completes' => [2, [['agent', 'running'], ['step', 'running']]],
        'in the middle of the first step text' => [4, [['agent', 'running'], ['step', 'running']]],
        'right after the tool ran' => [8, [['agent', 'running'], ['step', 'completed'], ['tool', 'completed']]],
        'as the second step starts' => [9, [['agent', 'running'], ['step', 'completed'], ['tool', 'completed'], ['step', 'running']]],
        'after the last text of the final step' => [13, [['agent', 'running'], ['step', 'completed'], ['tool', 'completed'], ['step', 'running']]],
        'on the final StreamEnd' => [14, [['agent', 'running'], ['step', 'completed'], ['tool', 'completed'], ['step', 'completed']]],
    ]);

    it('closes the abandoned attempt\'s open spans as incomplete when the same stream is iterated again', function () {
        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'x']]], text: 'Let me look'),
            FakeAnthropic::text('first try'),
            FakeAnthropic::toolUse([['id' => 'toolu_2', 'name' => 'lookup', 'input' => ['query' => 'x']]], text: 'Let me look'),
            FakeAnthropic::text('second try'),
        ]);

        $stream = (new AssistantAgent([new LookupTool]))->stream('Hi');

        // Stopped as the second step starts: that step is open.
        Streams::drain($stream, 9);
        Streams::drain($stream);

        $run = ($this->stored)();

        expect($run->trace()['status'])->toBe('completed')
            ->and($run->trace()['recovered'])->toBeFalse()
            ->and((new DatabaseStoreProbe)->traceCount())->toBe(1)
            ->and(array_map(fn (array $span) => [$span['type'], $span['attempt'], $span['step_number'], $span['status'], $span['issue_kind'], $span['ended_at'] !== null && $span['duration_ms'] !== null, $span['error_class'], $span['error_message']], $run->rawSpans()))->toBe([
                ['agent', 2, null, 'completed', null, true, null, null],
                ['step', 1, 0, 'completed', null, true, null, null],
                ['tool', 1, null, 'completed', null, true, null, null],
                ['step', 1, 1, 'incomplete', 'abandoned', false, null, null],
                ['step', 2, 0, 'completed', null, true, null, null],
                ['tool', 2, null, 'completed', null, true, null, null],
                ['step', 2, 1, 'completed', null, true, null, null],
            ]);
    });
});

describe('a failed stream that is iterated again', function () {
    it('continues the same trace and completes it with no error left on the trace or agent span', function () {
        FakeAnthropic::script([FakeAnthropic::streamError('partial text', message: 'First overload'), FakeAnthropic::text('again')]);

        $stream = (new AssistantAgent)->stream('Hi', model: FakeAnthropic::MODEL);
        [, $first] = Streams::drain($stream);
        [, $second] = Streams::drain($stream);

        // The failed attempt's buffer is still held, so the second attempt joins it and inserts nothing new.
        expect($this->inserts)->toBe(1);

        $run = ($this->stored)()->assertVolatileColumns();

        $failure = Captured::failure('exception', StreamErrorException::class, 'First overload', 'step', null);

        expect($first)->toBeInstanceOf(StreamErrorException::class)
            ->and($second)->toBeNull()
            ->and((new DatabaseStoreProbe)->traceCount())->toBe(1)
            ->and(Captured::pick([$run->trace()], Failures::TRACE)[0])->toBe(Failures::trace('completed', false, 3, [], ['input_tokens' => 10, 'output_tokens' => 5, 'unpriced_span_count' => 1]))
            ->and(Captured::pick($run->spans(), [...Failures::SPAN, 'sequence']))->toBe([
                Failures::span('agent', 2, null, 'completed', [], ['sequence' => 1]),
                Failures::span('step', 1, 0, 'failed', $failure, ['sequence' => 2]),
                Failures::span('step', 2, 0, 'completed', [], ['input_tokens' => 10, 'output_tokens' => 5, 'sequence' => 3]),
            ]);
    });

    it('ends failed with the second error when the second attempt fails too', function () {
        FakeAnthropic::script([
            FakeAnthropic::streamError('a', message: 'First overload'),
            FakeAnthropic::streamError('b', message: 'Second overload'),
        ]);

        $stream = (new AssistantAgent)->stream('Hi');
        Streams::drain($stream);
        Streams::drain($stream);

        expect($this->inserts)->toBe(1);

        $run = ($this->stored)()->assertVolatileColumns();

        $first = Captured::failure('exception', StreamErrorException::class, 'First overload', 'step', null);
        $second = Captured::failure('exception', StreamErrorException::class, 'Second overload', 'step', null);

        expect(Captured::pick([$run->trace()], Failures::TRACE)[0])->toBe(Failures::trace('failed', false, 3, $second))
            ->and(Captured::pick($run->spans(), Failures::SPAN))->toBe([
                Failures::span('agent', 2, null, 'failed', $second),
                Failures::span('step', 1, 0, 'failed', $first),
                Failures::span('step', 2, 0, 'failed', $second),
            ]);
    });
});

it('lets a streamed run finish and yields the same events to the consumer when every Trail listener throws', function () {
    ($this->toolScript)();

    [$normal] = Streams::drain((new AssistantAgent([new LookupTool]))->stream('Hi', model: FakeAnthropic::MODEL));

    ($this->toolScript)();

    Exceptions::fake();
    $this->app->instance(Recorder::class, new ThrowingRecorder($this->app, $this->app->make(CostCalculator::class)));

    [$guarded, $failure] = Streams::drain((new AssistantAgent([new LookupTool]))->stream('Hi', model: FakeAnthropic::MODEL));

    expect($failure)->toBeNull()->and($guarded)->toBe($normal);

    // A stream that fails runs the failure handlers too.
    FakeAnthropic::script([FakeAnthropic::streamError('partial text')]);
    [, $failed] = Streams::drain((new AssistantAgent)->stream('Hi', model: FakeAnthropic::MODEL));

    expect($failed)->toBeInstanceOf(StreamErrorException::class);

    foreach (['agentStarting', 'stepCompleted', 'toolInvoked', 'agentFailed'] as $handler) {
        Exceptions::assertReported(fn (RuntimeException $e) => $e->getMessage() === "{$handler} failed");
    }

    foreach (['stepStarting', 'toolInvoking', 'agentCompleted', 'stepFailed'] as $handler) {
        Exceptions::assertReported(fn (TypeError $e) => $e->getMessage() === "{$handler} failed");
    }
});

describe('a streamed run\'s final answer', function () {
    it('is the last step\'s empty text, not an earlier step\'s', function () {
        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'x']]], text: 'Let me look'),
            FakeAnthropic::text(''),
        ]);

        Streams::drain((new AssistantAgent([new LookupTool]))->stream('Hi', model: FakeAnthropic::MODEL));
        $run = ($this->stored)();

        expect($run->spans()[0]['output']['text'])->toBe('');
    });

    it('is the last step\'s text when the run pauses for approval', function () {
        FakeAnthropic::script([FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'delete_records', 'input' => ['table' => 'users']]], text: 'I will delete them')]);

        $stream = (new AssistantAgent([new ApprovalTool]))->withMessages([])->stream('Delete the users', model: FakeAnthropic::MODEL);
        Streams::drain($stream);
        $run = ($this->stored)();

        expect($run->trace()['status'])->toBe('awaiting_approval')
            ->and($run->spans()[0]['output']['text'])->toBe('I will delete them');
    });

    // A streamed run only fails over before anything was yielded, so a failed attempt never
    // completes a step: an earlier attempt's text cannot reach the answer through a failover.
    it('is the second provider\'s text after a failover', function () {
        FakeAnthropic::script([FakeAnthropic::error(429, 'Slow down'), FakeAnthropic::text('second provider')]);

        Streams::drain((new AssistantAgent)->stream('Hi', provider: $this->providers));
        $run = ($this->stored)();

        expect($run->spans()[0]['output']['text'])->toBe('second provider');
    });
});

describe('a streamed trace whose invocation id is started again', function () {
    it('is not revived by a plain run, which replaces it', function () {
        FakeAnthropic::script([FakeAnthropic::text('streamed answer')]);

        $stream = (new AssistantAgent)->stream('Hi', model: FakeAnthropic::MODEL);
        Streams::drain($stream);

        $streaming = $this->sdk->sole(StreamingAgent::class)->event;
        $id = $stream->invocationId;

        // The streamed trace is finished and still buffered when a plain start reuses its id.
        event(new PromptingAgent($id, $streaming->prompt));
        event(new AgentPrompted($id, $streaming->prompt, new AgentResponse($id, 'plain answer', new TextUsage(0, 0), new Meta)));
        Trail::flush();

        $run = Captured::read($id);

        // The streamed run is not continued, so it is not turned back into a running one. A new
        // plain trace takes its place in the buffer and is the only one written; the row the streamed
        // run inserted as it started is updated to it, and the streamed run's own spans were never written.
        expect($this->inserts)->toBe(1)
            ->and((new DatabaseStoreProbe)->traceCount())->toBe(1)
            ->and($run->rawTrace()['streamed'])->toBeFalse()
            ->and($run->trace()['status'])->toBe('completed')
            ->and(array_column($run->spans(), 'type'))->toBe(['agent'])
            ->and($run->spans()[0]['output']['text'])->toBe('plain answer');
    });

    it('is left running on its second attempt when the consumer abandons it, keeping the first attempt\'s failed step', function () {
        FakeAnthropic::script([FakeAnthropic::streamError('partial text', message: 'First overload'), FakeAnthropic::text('again')]);

        $stream = (new AssistantAgent)->stream('Hi', model: FakeAnthropic::MODEL);
        Streams::drain($stream);
        // Stopped as the second attempt's first step starts.
        Streams::drain($stream, 2);

        $run = ($this->stored)();
        $failure = Captured::failure('exception', StreamErrorException::class, 'First overload', 'step', null);

        expect($this->inserts)->toBe(1)
            ->and($run->trace()['status'])->toBe('running')
            ->and($run->trace()['recovered'])->toBeFalse()
            ->and([$run->rawTrace()['ended_at'], $run->rawTrace()['error_class']])->toBe([null, null])
            ->and(Captured::pick($run->spans(), Failures::SPAN))->toBe([
                Failures::span('agent', 2, null, 'running'),
                Failures::span('step', 1, 0, 'failed', $failure),
                Failures::span('step', 2, 0, 'running'),
            ]);
    });

    // The SDK replays a finished stream without firing events, so it never revives a recovered
    // trace; a hand-built start stands in for it.
    it('is no longer recovered once revived', function () {
        FakeAnthropic::script([FakeAnthropic::error(429, 'Slow down'), FakeAnthropic::text('ok')]);

        $stream = (new AssistantAgent)->stream('Hi', provider: $this->providers);
        Streams::drain($stream);

        $streaming = $this->sdk->of(StreamingAgent::class)[0]->event;

        event(new StreamingAgent($stream->invocationId, $streaming->prompt));

        $run = ($this->stored)();

        expect($this->inserts)->toBe(1)
            ->and($run->trace()['recovered'])->toBeFalse()
            ->and($run->trace()['status'])->toBe('running')
            ->and($run->rawTrace()['ended_at'])->toBeNull();
    });
});
