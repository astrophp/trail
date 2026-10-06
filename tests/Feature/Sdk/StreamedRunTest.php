<?php

use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Sdk\EventLog;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Tools\LookupTool;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Event;
use Laravel\Ai\Events\AgentFailed;
use Laravel\Ai\Events\AgentFailedOver;
use Laravel\Ai\Events\AgentPrompted;
use Laravel\Ai\Events\AgentStreamed;
use Laravel\Ai\Events\PromptingAgent;
use Laravel\Ai\Events\StartingStep;
use Laravel\Ai\Events\StepCompleted;
use Laravel\Ai\Events\StepFailed;
use Laravel\Ai\Events\StreamingAgent;
use Laravel\Ai\Exceptions\RateLimitedException;
use Laravel\Ai\Exceptions\StreamErrorException;
use Laravel\Ai\Providers\AnthropicProvider;
use Laravel\Ai\Responses\StreamableAgentResponse;
use Laravel\Ai\Responses\StreamedAgentResponse;
use Laravel\Ai\Streaming\Events\Error;
use Laravel\Ai\Streaming\Events\StreamEnd;
use Laravel\Ai\Streaming\Events\TextDelta;

/*
|--------------------------------------------------------------------------
| The streamed agent run
|--------------------------------------------------------------------------
|
| Pins down which events a ->stream() call fires, where in the consumer's
| iteration each of them lands, which listener registrations receive them,
| what the streamed response carries, and what happens when the stream is
| abandoned or fails. A streamed run is lazy: the SDK only advances while
| the consumer asks for the next event.
|
| Order and data are asserted against the real Anthropic gateway with its
| HTTP faked (server-sent events), which also supplies usage, the responding
| model and stream error events. The SDK's own fake is used once, to show it
| produces the same events.
|
*/

/**
 * Iterate a stream and record, in order, what the consumer received ("stream:TextDelta(Hi)") and the
 * SDK events that fired in between ("sdk:StartingStep#0"). An SDK event is listed before the stream
 * event the consumer was waiting for when it fired. Stops after $stopAfter stream events, and
 * returns the exception that ended the iteration, if any.
 *
 * @return array{list<string>, ?Throwable}
 */
function streamTrace(EventLog $sdk, iterable $stream, ?int $stopAfter = null): array
{
    $trace = [];
    $seen = count($sdk->timeline());
    $received = 0;
    $failure = null;

    $flush = function () use ($sdk, &$trace, &$seen): void {
        $timeline = $sdk->timeline();

        foreach (array_slice($timeline, $seen) as $label) {
            $trace[] = 'sdk:'.$label;
        }

        $seen = count($timeline);
    };

    try {
        foreach ($stream as $event) {
            $flush();

            $trace[] = 'stream:'.class_basename($event).($event instanceof TextDelta ? '('.$event->delta.')' : '');

            if ($stopAfter !== null && ++$received === $stopAfter) {
                return [$trace, null];
            }
        }
    } catch (Throwable $exception) {
        $failure = $exception;
    }

    $flush();

    return [$trace, $failure];
}

/**
 * Start a run that calls one tool and then answers, read $stopAfter events of it, and abandon it.
 * Every reference to the response is dropped when this returns.
 *
 * @return array{list<string>, list<string>, list<string>, FakeAnthropic}
 */
function streamAbandonedAfter(EventLog $sdk, int $stopAfter): array
{
    $anthropic = FakeAnthropic::script([
        FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'x']]], text: 'Let me look'),
        FakeAnthropic::text('Done now'),
    ]);

    $callbacks = [];

    $response = (new AssistantAgent([new LookupTool]))->stream('Hi')
        ->then(function () use (&$callbacks): void {
            $callbacks[] = 'then';
        })
        ->catch(function () use (&$callbacks): void {
            $callbacks[] = 'catch';
        });

    [$trace] = streamTrace($sdk, $response, $stopAfter);

    $atBreak = $sdk->timeline();

    unset($response);

    return [$trace, $atBreak, $callbacks, $anthropic];
}

describe('event order', function () {
    it('fires nothing until the consumer starts iterating', function () {
        $anthropic = FakeAnthropic::script([FakeAnthropic::text('Hello there')]);

        $response = (new AssistantAgent)->stream('Hi');

        expect($response)->toBeInstanceOf(StreamableAgentResponse::class)
            ->and($this->sdk->timeline())->toBe([])
            ->and($anthropic->urls())->toBe([]);
    });

    it('fires StreamingAgent and the first StartingStep before the consumer receives the first event', function () {
        FakeAnthropic::script([FakeAnthropic::text('Hello there')]);

        $response = (new AssistantAgent)->stream('Hi');

        foreach ($response as $first) {
            break;
        }

        expect(class_basename($first))->toBe('StreamStart')
            ->and($this->sdk->timeline())->toBe(['StreamingAgent', 'StartingStep#0']);
    });

    it('interleaves step, tool and terminal events with what the consumer receives', function () {
        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'x']]], text: 'Let me look'),
            FakeAnthropic::text('Done now'),
        ]);

        [$trace, $failure] = streamTrace($this->sdk, (new AssistantAgent([new LookupTool]))->stream('Hi'));

        // StepCompleted fires after the step's last streamed event and tools run before their ToolResult is
        // handed over; AgentStreamed fires when the consumer asks for the event after StreamEnd.
        expect($failure)->toBeNull()
            ->and($trace)->toBe([
                'sdk:StreamingAgent',
                'sdk:StartingStep#0',
                'stream:StreamStart',
                'stream:TextStart',
                'stream:TextDelta(Let)',
                'stream:TextDelta( me)',
                'stream:TextDelta( look)',
                'stream:ToolCall',
                'stream:TextEnd',
                'sdk:StepCompleted#0',
                'sdk:InvokingTool(lookup)',
                'sdk:ToolInvoked(lookup)',
                'stream:ToolResult',
                'sdk:StartingStep#1',
                'stream:StreamStart',
                'stream:TextStart',
                'stream:TextDelta(Done)',
                'stream:TextDelta( now)',
                'stream:TextEnd',
                'sdk:StepCompleted#1',
                'stream:StreamEnd',
                'sdk:AgentStreamed',
            ]);
    });

    it('has not fired AgentStreamed yet when the consumer receives the last event', function () {
        FakeAnthropic::script([FakeAnthropic::text('Hello there')]);

        $atLastEvent = null;

        foreach ((new AssistantAgent)->stream('Hi') as $event) {
            $atLastEvent = $this->sdk->timeline();
        }

        expect($atLastEvent)->toBe(['StreamingAgent', 'StartingStep#0', 'StepCompleted#0'])
            ->and($this->sdk->timeline())->toBe(['StreamingAgent', 'StartingStep#0', 'StepCompleted#0', 'AgentStreamed']);
    });

    it('never fires PromptingAgent or AgentPrompted for a streamed run, only their subclasses', function () {
        FakeAnthropic::script([FakeAnthropic::text('Hello there')]);

        foreach ((new AssistantAgent)->stream('Hi') as $event) {
            //
        }

        expect($this->sdk->names())->toBe(['StreamingAgent', 'StartingStep', 'StepCompleted', 'AgentStreamed'])
            ->and($this->sdk->of(PromptingAgent::class))->toBe([])
            ->and($this->sdk->of(AgentPrompted::class))->toBe([])
            ->and($this->sdk->sole(StreamingAgent::class)->event)->toBeInstanceOf(PromptingAgent::class)
            ->and($this->sdk->sole(AgentStreamed::class)->event)->toBeInstanceOf(AgentPrompted::class);
    });

    it('uses one invocation id for the stream response and every event', function () {
        FakeAnthropic::script([FakeAnthropic::text('Hello there')]);

        $response = (new AssistantAgent)->stream('Hi');

        foreach ($response as $event) {
            //
        }

        expect($this->sdk->invocationIds())->toBe([$response->invocationId])
            ->and(strlen($response->invocationId))->toBe(36)
            ->and($response->invocationId[14])->toBe('7')
            ->and($this->sdk->sole(StreamingAgent::class)->event->prompt->invocationId)->toBe($response->invocationId);
    });

    it('produces the same events from the SDK fake as from a real gateway', function () {
        AssistantAgent::fake(['Hello there']);

        [$faked] = streamTrace($this->sdk, (new AssistantAgent)->stream('Hi'));

        expect($faked)->toBe([
            'sdk:StreamingAgent',
            'sdk:StartingStep#0',
            'stream:StreamStart',
            'stream:TextStart',
            'stream:TextDelta(Hello)',
            'stream:TextDelta( there)',
            'stream:TextEnd',
            'sdk:StepCompleted#0',
            'stream:StreamEnd',
            'sdk:AgentStreamed',
        ]);
    });
});

describe('listener registration', function () {
    // The dispatcher matches an event by its own class and its interfaces, never by a parent class,
    // so a listener registered for the base event does not see the stream subclass.
    it('delivers StreamingAgent and AgentStreamed only to listeners registered for exactly those classes', function () {
        $received = [];

        foreach ([PromptingAgent::class, StreamingAgent::class, AgentPrompted::class, AgentStreamed::class] as $class) {
            Event::listen($class, function (object $event) use (&$received, $class): void {
                $received[] = class_basename($class).' <- '.class_basename($event);
            });
        }

        FakeAnthropic::script([FakeAnthropic::text('Hello there')]);

        foreach ((new AssistantAgent)->stream('Hi') as $event) {
            //
        }

        expect($received)->toBe([
            'StreamingAgent <- StreamingAgent',
            'AgentStreamed <- AgentStreamed',
        ]);
    });

    it('delivers PromptingAgent and AgentPrompted only to a non-streamed run', function () {
        $received = [];

        foreach ([PromptingAgent::class, StreamingAgent::class, AgentPrompted::class, AgentStreamed::class] as $class) {
            Event::listen($class, function (object $event) use (&$received, $class): void {
                $received[] = class_basename($class).' <- '.class_basename($event);
            });
        }

        FakeAnthropic::script([FakeAnthropic::text('Hello there')]);

        (new AssistantAgent)->prompt('Hi');

        expect($received)->toBe([
            'PromptingAgent <- PromptingAgent',
            'AgentPrompted <- AgentPrompted',
        ]);
    });

    it('reaches both the plain and the stream events through a namespace wildcard', function () {
        $received = [];

        Event::listen('Laravel\Ai\Events\*', function (string $name) use (&$received): void {
            if (in_array($name, [PromptingAgent::class, StreamingAgent::class, AgentPrompted::class, AgentStreamed::class], true)) {
                $received[] = class_basename($name);
            }
        });

        FakeAnthropic::script([FakeAnthropic::text('one'), FakeAnthropic::text('two')]);

        (new AssistantAgent)->prompt('Hi');

        foreach ((new AssistantAgent)->stream('Hi') as $event) {
            //
        }

        expect($received)->toBe(['PromptingAgent', 'AgentPrompted', 'StreamingAgent', 'AgentStreamed']);
    });
});

describe('the streamed response', function () {
    beforeEach(function () {
        $this->anthropic = FakeAnthropic::script([
            FakeAnthropic::toolUse(
                [['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'x']]],
                usage: ['input_tokens' => 100, 'output_tokens' => 20],
                text: 'Let me look',
            ),
            FakeAnthropic::text('Done now', usage: ['input_tokens' => 7, 'output_tokens' => 3], model: 'claude-test-responding'),
        ]);

        $this->thenArgument = null;

        $this->stream = (new AssistantAgent([new LookupTool]))->stream('Hi', model: FakeAnthropic::MODEL)
            ->then(function (StreamedAgentResponse $response): void {
                $this->thenArgument = $response;
            });

        foreach ($this->stream as $event) {
            //
        }

        $this->response = $this->sdk->sole(AgentStreamed::class)->event->response;
    });

    it('hands the same StreamedAgentResponse to AgentStreamed and to then()', function () {
        expect($this->response)->toBeInstanceOf(StreamedAgentResponse::class)
            ->and($this->thenArgument)->toBe($this->response);
    });

    it('carries the invocation id of the run', function () {
        expect($this->response->invocationId)->toBe($this->stream->invocationId)
            ->and($this->sdk->sole(AgentStreamed::class)->invocationId)->toBe($this->stream->invocationId);
    });

    it('joins the text of every step with a blank line', function () {
        expect($this->response->text)->toBe("Let me look\n\nDone now")
            ->and($this->stream->text)->toBe("Let me look\n\nDone now");
    });

    it('sums the usage of every step', function () {
        expect($this->response->usage->inputTokens)->toBe(107)
            ->and($this->response->usage->outputTokens)->toBe(23)
            ->and($this->stream->usage->inputTokens)->toBe(107);
    });

    it('reports the provider and the responding model of the last step, not the requested one', function () {
        expect($this->response->meta->provider)->toBe('anthropic')
            ->and($this->response->meta->model)->toBe('claude-test-responding')
            ->and($this->sdk->sole(StreamingAgent::class)->event->prompt->model)->toBe(FakeAnthropic::MODEL);
    });

    it('carries the tool calls and tool results of the run', function () {
        expect($this->response->toolCalls)->toHaveCount(1)
            ->and($this->response->toolCalls[0]->id)->toBe('toolu_1')
            ->and($this->response->toolCalls[0]->name)->toBe('lookup')
            ->and($this->response->toolCalls[0]->arguments)->toBe(['query' => 'x'])
            ->and($this->response->toolResults)->toHaveCount(1)
            ->and($this->response->toolResults[0]->name)->toBe('lookup')
            ->and($this->response->toolResults[0]->result)->toBe('Result for x')
            ->and($this->response->toolResults[0]->failed)->toBeFalse();
    });

    it('carries one step per model call, each with its own usage', function () {
        expect($this->response->steps)->toHaveCount(2)
            ->and($this->response->steps[0]->text)->toBe('Let me look')
            ->and($this->response->steps[0]->usage->inputTokens)->toBe(100)
            ->and($this->response->steps[0]->toolCalls)->toHaveCount(1)
            ->and($this->response->steps[0]->toolResults)->toHaveCount(1)
            ->and($this->response->steps[0]->finishReason->value)->toBe('tool_calls')
            ->and($this->response->steps[1]->text)->toBe('Done now')
            ->and($this->response->steps[1]->usage->inputTokens)->toBe(7)
            ->and($this->response->steps[1]->finishReason->value)->toBe('stop');
    });

    it('reports the requested model, not the responding one, on each step and each StepCompleted', function () {
        // Only the response meta (taken from the stream's own start event) knows the responding model.
        expect($this->response->steps[1]->meta->model)->toBe(FakeAnthropic::MODEL)
            ->and($this->sdk->of(StepCompleted::class)[1]->event->response->meta->model)->toBe(FakeAnthropic::MODEL)
            ->and($this->sdk->of(StepCompleted::class)[1]->event->response->usage->inputTokens)->toBe(7);
    });

    it('has no raw provider response on a streamed step', function () {
        foreach ($this->sdk->of(StepCompleted::class) as $entry) {
            expect($entry->event->response->raw)->toBeNull();
        }

        foreach ($this->response->steps as $step) {
            expect($step->raw)->toBeNull();
        }
    });

    it('has no reasoning, pending approvals or conversation for a plain run', function () {
        expect($this->response->reasoning)->toBe('')
            ->and($this->response->pendingApprovals)->toHaveCount(0)
            ->and($this->response->conversationId)->toBeNull();
    });

    it('also exposes the drained result on the streamable response itself', function () {
        expect($this->stream->events)->toHaveCount(14)
            ->and($this->stream->events->last())->toBeInstanceOf(StreamEnd::class)
            ->and($this->response->events)->toHaveCount(14);
    });
});

describe('then callbacks', function () {
    it('runs the then callback after the AgentStreamed listeners', function () {
        $order = [];

        Event::listen(AgentStreamed::class, function () use (&$order): void {
            $order[] = 'AgentStreamed';
        });

        FakeAnthropic::script([FakeAnthropic::text('Hello there')]);

        $stream = (new AssistantAgent)->stream('Hi')->then(function () use (&$order): void {
            $order[] = 'then';
        });

        foreach ($stream as $event) {
            $order[] = 'consumer:'.class_basename($event);
        }

        expect($order)->toBe([
            'consumer:StreamStart', 'consumer:TextStart', 'consumer:TextDelta', 'consumer:TextDelta',
            'consumer:TextEnd', 'consumer:StreamEnd', 'AgentStreamed', 'then',
        ]);
    });

    it('runs a then callback added after the stream has drained immediately', function () {
        FakeAnthropic::script([FakeAnthropic::text('Hello there')]);

        $stream = (new AssistantAgent)->stream('Hi');

        foreach ($stream as $event) {
            //
        }

        $received = null;

        $stream->then(function (StreamedAgentResponse $response) use (&$received): void {
            $received = $response;
        });

        expect($received)->toBeInstanceOf(StreamedAgentResponse::class)
            ->and($received)->toBe($this->sdk->sole(AgentStreamed::class)->event->response);
    });

    it('drains the stream when each() is used and stops it early when the callback returns false', function () {
        FakeAnthropic::script([FakeAnthropic::text('one two three'), FakeAnthropic::text('one two three')]);

        $received = [];

        (new AssistantAgent)->stream('Hi')->each(function ($event) use (&$received): void {
            $received[] = class_basename($event);
        });

        expect($received)->toBe(['StreamStart', 'TextStart', 'TextDelta', 'TextDelta', 'TextDelta', 'TextEnd', 'StreamEnd'])
            ->and($this->sdk->timeline())->toBe(['StreamingAgent', 'StartingStep#0', 'StepCompleted#0', 'AgentStreamed']);

        $this->sdk->clear();

        $count = 0;

        (new AssistantAgent)->stream('Hi')->each(function () use (&$count): bool {
            return ++$count < 3;
        });

        expect($count)->toBe(3)
            ->and($this->sdk->timeline())->toBe(['StreamingAgent', 'StartingStep#0']);
    });
});

describe('with several providers', function () {
    it('gives then() a different response object than AgentStreamed, with the responding provider and model', function () {
        FakeAnthropic::script([FakeAnthropic::text('ok', model: 'claude-test-responding')]);

        $thenArgument = null;

        $stream = (new AssistantAgent)->stream('Hi', provider: ['anthropic' => 'model-a', 'backup' => 'model-b'])
            ->then(function (StreamedAgentResponse $response) use (&$thenArgument): void {
                $thenArgument = $response;
            });

        foreach ($stream as $event) {
            //
        }

        $dispatched = $this->sdk->sole(AgentStreamed::class)->event->response;

        expect($thenArgument)->not->toBe($dispatched)
            ->and($thenArgument->invocationId)->toBe($dispatched->invocationId)
            ->and($thenArgument->text)->toBe('ok')
            ->and($dispatched->text)->toBe('ok')
            ->and($dispatched->meta->provider)->toBe('anthropic')
            ->and($thenArgument->meta->provider)->toBe('anthropic')
            ->and($thenArgument->meta->model)->toBe('claude-test-responding');
    });
});

describe('abandoned streams', function () {
    // Stream events the tool run hands over, in order: 1 StreamStart, 2 TextStart, 3-5 TextDelta,
    // 6 ToolCall, 7 TextEnd, 8 ToolResult, 9 StreamStart, 10 TextStart, 11-12 TextDelta, 13 TextEnd, 14 StreamEnd.
    it('records no terminal event whenever the consumer stops', function (int $stopAfter, array $expected) {
        [, $atBreak, $callbacks] = streamAbandonedAfter($this->sdk, $stopAfter);

        $afterDestroy = $this->sdk->timeline();

        gc_collect_cycles();

        expect($atBreak)->toBe($expected)
            ->and($afterDestroy)->toBe($expected)
            ->and($this->sdk->timeline())->toBe($expected)
            ->and($callbacks)->toBe([])
            ->and($this->sdk->of(AgentStreamed::class))->toBe([])
            ->and($this->sdk->of(AgentFailed::class))->toBe([]);
    })->with([
        'before the first step completes' => [2, ['StreamingAgent', 'StartingStep#0']],
        'in the middle of the first step text' => [4, ['StreamingAgent', 'StartingStep#0']],
        'right after the tool ran' => [8, ['StreamingAgent', 'StartingStep#0', 'StepCompleted#0', 'InvokingTool(lookup)', 'ToolInvoked(lookup)']],
        'as the second step starts' => [9, ['StreamingAgent', 'StartingStep#0', 'StepCompleted#0', 'InvokingTool(lookup)', 'ToolInvoked(lookup)', 'StartingStep#1']],
        // StepCompleted#1 only fires once the consumer asks for the event after TextEnd.
        'after the last text of the final step' => [13, ['StreamingAgent', 'StartingStep#0', 'StepCompleted#0', 'InvokingTool(lookup)', 'ToolInvoked(lookup)', 'StartingStep#1']],
        // AgentStreamed only fires once the consumer asks for the event after StreamEnd.
        'on the final StreamEnd' => [14, ['StreamingAgent', 'StartingStep#0', 'StepCompleted#0', 'InvokingTool(lookup)', 'ToolInvoked(lookup)', 'StartingStep#1', 'StepCompleted#1']],
    ]);

    it('records nothing at all for a stream that is never iterated', function () {
        $anthropic = FakeAnthropic::script([FakeAnthropic::text('Hello there')]);

        $stream = (new AssistantAgent)->stream('Hi')->then(fn () => null)->catch(fn () => null);

        unset($stream);
        gc_collect_cycles();

        expect($this->sdk->timeline())->toBe([])
            ->and($anthropic->urls())->toBe([]);
    });

    it('does not send the next request once the consumer stopped after the tool ran', function () {
        [, , , $anthropic] = streamAbandonedAfter($this->sdk, 8);

        gc_collect_cycles();

        expect($anthropic->urls())->toHaveCount(1)
            ->and($anthropic->remaining())->toBe(1);
    });

    it('can be resumed by iterating the same response again, which starts a new attempt', function () {
        FakeAnthropic::script([FakeAnthropic::text('first try'), FakeAnthropic::text('second try')]);

        $stream = (new AssistantAgent)->stream('Hi');

        streamTrace($this->sdk, $stream, 3);

        expect($this->sdk->timeline())->toBe(['StreamingAgent', 'StartingStep#0']);

        streamTrace($this->sdk, $stream);

        // The first attempt is still unfinished, so the second iteration begins again from the start.
        expect($this->sdk->timeline())->toBe([
            'StreamingAgent', 'StartingStep#0',
            'StreamingAgent', 'StartingStep#0', 'StepCompleted#0', 'AgentStreamed',
        ])->and($this->sdk->invocationIds())->toBe([$stream->invocationId])
            ->and($stream->text)->toBe('second try');
    });
});

describe('iterating a drained stream again', function () {
    it('replays the recorded events without firing any SDK event or sending a request', function () {
        $anthropic = FakeAnthropic::script([FakeAnthropic::text('Hello there')]);

        $stream = (new AssistantAgent)->stream('Hi');

        [$first] = streamTrace($this->sdk, $stream);

        $timeline = $this->sdk->timeline();

        [$second] = streamTrace($this->sdk, $stream);

        expect(array_values(array_filter($second, fn (string $line): bool => str_starts_with($line, 'sdk:'))))->toBe([])
            ->and(array_values(array_filter($second, fn (string $line): bool => str_starts_with($line, 'stream:'))))
            ->toBe(array_values(array_filter($first, fn (string $line): bool => str_starts_with($line, 'stream:'))))
            ->and($this->sdk->timeline())->toBe($timeline)
            ->and($anthropic->urls())->toHaveCount(1);
    });
});

describe('failures', function () {
    it('ends a run with AgentFailed and no failover when the provider sends an error event after text was streamed', function () {
        $anthropic = FakeAnthropic::script([FakeAnthropic::streamError('partial text'), FakeAnthropic::text('never used')]);

        $caught = [];

        $stream = (new AssistantAgent)->stream('Hi', provider: ['anthropic' => 'model-a', 'backup' => 'model-b'])
            ->catch(function (Throwable $exception) use (&$caught): void {
                $caught[] = $exception;
            });

        [$trace, $failure] = streamTrace($this->sdk, $stream);

        expect($trace)->toBe([
            'sdk:StreamingAgent',
            'sdk:StartingStep#0',
            'stream:StreamStart',
            'stream:TextStart',
            'stream:TextDelta(partial)',
            'stream:TextDelta( text)',
            'stream:Error',
            'sdk:StepFailed#0',
            'sdk:AgentFailed',
        ])->and($failure)->toBeInstanceOf(StreamErrorException::class)
            ->and($failure->getMessage())->toBe('Overloaded')
            ->and($caught)->toBe([$failure])
            ->and($this->sdk->sole(AgentFailed::class)->event->exception)->toBe($failure)
            ->and($this->sdk->of(AgentFailedOver::class))->toBe([])
            ->and($this->sdk->of(AgentStreamed::class))->toBe([])
            ->and($anthropic->urls())->toHaveCount(1)
            ->and($anthropic->remaining())->toBe(1);
    });

    it('carries the provider error event on the exception and on StepFailed', function () {
        FakeAnthropic::script([FakeAnthropic::streamError('partial text', message: 'Overloaded', type: 'overloaded_error')]);

        [, $failure] = streamTrace($this->sdk, (new AssistantAgent)->stream('Hi', provider: ['anthropic' => 'model-a', 'backup' => 'model-b']));

        $stepFailed = $this->sdk->sole(StepFailed::class)->event;

        expect($failure->error)->toBeInstanceOf(Error::class)
            ->and($failure->error->type)->toBe('overloaded_error')
            ->and($failure->error->message)->toBe('Overloaded')
            ->and($failure->error->recoverable)->toBeFalse()
            ->and($stepFailed->exception)->toBe($failure)
            ->and($stepFailed->stepNumber)->toBe(0)
            ->and($stepFailed->model)->toBe('model-a')
            ->and($stepFailed->isFinalStep)->toBeFalse()
            ->and($stepFailed->provider)->toBeInstanceOf(AnthropicProvider::class)
            ->and($stepFailed->provider->name())->toBe('anthropic')
            ->and($stepFailed->invocationId)->toBe($this->sdk->sole(AgentFailed::class)->invocationId)
            ->and($stepFailed->time)->toBeFloat()
            ->and($this->sdk->sole(AgentFailed::class)->event->prompt->model)->toBe('model-a');
    });

    it('does not fail over for a stream error event even when nothing but the start of the stream was seen', function () {
        $anthropic = FakeAnthropic::script([FakeAnthropic::streamError(''), FakeAnthropic::text('never used')]);

        [$trace, $failure] = streamTrace($this->sdk, (new AssistantAgent)->stream('Hi', provider: ['anthropic' => 'model-a', 'backup' => 'model-b']));

        expect($trace)->toBe([
            'sdk:StreamingAgent',
            'sdk:StartingStep#0',
            'stream:StreamStart',
            'stream:TextStart',
            'stream:Error',
            'sdk:StepFailed#0',
            'sdk:AgentFailed',
        ])->and($failure)->toBeInstanceOf(StreamErrorException::class)
            ->and($anthropic->urls())->toHaveCount(1);
    });

    it('does not fail over for a failoverable error once something was streamed, and never calls the second provider', function () {
        $anthropic = FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'x']]]),
            FakeAnthropic::error(429),
            FakeAnthropic::text('never used'),
        ]);

        $stream = (new AssistantAgent([new LookupTool]))->stream('Hi', provider: ['anthropic' => 'model-a', 'backup' => 'model-b']);

        [$trace, $failure] = streamTrace($this->sdk, $stream);

        // The same rate limit on the first request of the run would have moved on to the backup provider.
        expect($trace)->toBe([
            'sdk:StreamingAgent',
            'sdk:StartingStep#0',
            'stream:StreamStart',
            'stream:ToolCall',
            'sdk:StepCompleted#0',
            'sdk:InvokingTool(lookup)',
            'sdk:ToolInvoked(lookup)',
            'stream:ToolResult',
            'sdk:StartingStep#1',
            'sdk:StepFailed#1',
            'sdk:AgentFailed',
        ])->and($failure)->toBeInstanceOf(RateLimitedException::class)
            ->and($this->sdk->of(AgentFailedOver::class))->toBe([])
            ->and($this->sdk->sole(AgentFailed::class)->event->exception)->toBe($failure)
            ->and($anthropic->urls())->toBe([
                'https://api.anthropic.com/v1/messages',
                'https://api.anthropic.com/v1/messages',
            ]);
    });

    it('fails over before anything was streamed, within the same invocation and starting again at step 0', function () {
        $anthropic = FakeAnthropic::script([FakeAnthropic::error(429), FakeAnthropic::text('ok', model: 'claude-test-backup')]);

        [$trace, $failure] = streamTrace($this->sdk, (new AssistantAgent)->stream('Hi', provider: ['anthropic' => 'model-a', 'backup' => 'model-b']));

        expect($failure)->toBeNull()
            ->and($trace)->toBe([
                'sdk:StreamingAgent',
                'sdk:StartingStep#0',
                'sdk:StepFailed#0',
                'sdk:AgentFailedOver',
                'sdk:StreamingAgent',
                'sdk:StartingStep#0',
                'stream:StreamStart',
                'stream:TextStart',
                'stream:TextDelta(ok)',
                'stream:TextEnd',
                'sdk:StepCompleted#0',
                'stream:StreamEnd',
                'sdk:AgentStreamed',
            ])->and($this->sdk->of(AgentFailed::class))->toBe([])
            ->and($this->sdk->invocationIds())->toHaveCount(1)
            ->and($this->sdk->forInvocation($this->sdk->invocationIds()[0])->timeline())->toBe($this->sdk->timeline())
            ->and($anthropic->urls())->toBe([
                'https://api.anthropic.com/v1/messages',
                'https://backup.anthropic.test/v1/messages',
            ]);
    });

    it('describes both attempts and the failover on their events', function () {
        FakeAnthropic::script([FakeAnthropic::error(429), FakeAnthropic::text('ok')]);

        streamTrace($this->sdk, (new AssistantAgent)->stream('Hi', provider: ['anthropic' => 'model-a', 'backup' => 'model-b']));

        [$firstAttempt, $secondAttempt] = $this->sdk->of(StreamingAgent::class);
        [$firstStep, $secondStep] = $this->sdk->of(StartingStep::class);
        $stepFailed = $this->sdk->sole(StepFailed::class)->event;
        $failedOver = $this->sdk->sole(AgentFailedOver::class)->event;

        expect($firstAttempt->event->prompt->provider->name())->toBe('anthropic')
            ->and($firstAttempt->event->prompt->model)->toBe('model-a')
            ->and($secondAttempt->event->prompt->provider->name())->toBe('backup')
            ->and($secondAttempt->event->prompt->model)->toBe('model-b')
            ->and($firstStep->event->model)->toBe('model-a')
            ->and($secondStep->event->model)->toBe('model-b')
            ->and($stepFailed->exception)->toBeInstanceOf(RateLimitedException::class)
            ->and($stepFailed->model)->toBe('model-a')
            ->and($failedOver->provider->name())->toBe('anthropic')
            ->and($failedOver->model)->toBe('model-a')
            ->and($failedOver->exception)->toBe($stepFailed->exception);
    });

    it('ends in AgentFailed alone, not a second failover, when the last provider fails as well', function () {
        FakeAnthropic::script([FakeAnthropic::error(429), FakeAnthropic::error(500)]);

        [$trace, $failure] = streamTrace($this->sdk, (new AssistantAgent)->stream('Hi', provider: ['anthropic' => 'model-a', 'backup' => 'model-b']));

        expect($trace)->toBe([
            'sdk:StreamingAgent',
            'sdk:StartingStep#0',
            'sdk:StepFailed#0',
            'sdk:AgentFailedOver',
            'sdk:StreamingAgent',
            'sdk:StartingStep#0',
            'sdk:StepFailed#0',
            'sdk:AgentFailed',
        ])->and($failure)->toBeInstanceOf(RequestException::class)
            ->and($this->sdk->sole(AgentFailed::class)->event->exception)->toBe($failure)
            ->and($this->sdk->sole(AgentFailed::class)->event->prompt->model)->toBe('model-b');
    });

    it('ends in AgentFailed without a failover event when a single provider fails before anything was streamed', function () {
        FakeAnthropic::script([FakeAnthropic::error(429)]);

        $caught = [];

        $stream = (new AssistantAgent)->stream('Hi')->catch(function (Throwable $exception) use (&$caught): void {
            $caught[] = $exception;
        });

        [$trace, $failure] = streamTrace($this->sdk, $stream);

        expect($trace)->toBe([
            'sdk:StreamingAgent',
            'sdk:StartingStep#0',
            'sdk:StepFailed#0',
            'sdk:AgentFailed',
        ])->and($failure)->toBeInstanceOf(RateLimitedException::class)
            ->and($caught)->toBe([$failure])
            ->and($this->sdk->sole(StepFailed::class)->event->exception)->toBe($failure)
            ->and($this->sdk->sole(AgentFailed::class)->event->exception)->toBe($failure);
    });

    it('starts a fresh attempt when a failed stream is iterated again', function () {
        FakeAnthropic::script([FakeAnthropic::streamError('partial text'), FakeAnthropic::text('again')]);

        $stream = (new AssistantAgent)->stream('Hi');

        streamTrace($this->sdk, $stream);
        streamTrace($this->sdk, $stream);

        expect($this->sdk->timeline())->toBe([
            'StreamingAgent', 'StartingStep#0', 'StepFailed#0', 'AgentFailed',
            'StreamingAgent', 'StartingStep#0', 'StepCompleted#0', 'AgentStreamed',
        ])->and($this->sdk->invocationIds())->toBe([$stream->invocationId]);
    });
});
