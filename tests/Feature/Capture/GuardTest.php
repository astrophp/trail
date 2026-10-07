<?php

use Astro\Trail\Capture\Guard;
use Astro\Trail\Capture\Recorder;
use Astro\Trail\Exceptions\RecordingFailed;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Pricing\CostCalculator;
use Astro\Trail\Storage\Contracts\TraceStore;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Capture\FailsFirstStore;
use Astro\Trail\Tests\Fixtures\Capture\Failures;
use Astro\Trail\Tests\Fixtures\Capture\Streams;
use Astro\Trail\Tests\Fixtures\Capture\ThrowingRecorder;
use Astro\Trail\Tests\Fixtures\Capture\ThrowingStore;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Storage\DatabaseStoreProbe;
use Astro\Trail\Tests\Fixtures\Tools\CallbackTool;
use Astro\Trail\Tests\Fixtures\Tools\LookupTool;
use Illuminate\Contracts\Debug\ExceptionHandler;
use Illuminate\Support\Facades\Exceptions;
use Laravel\Ai\Events\AgentFailed;
use Laravel\Ai\Events\StepCompleted;
use Laravel\Ai\Events\StepFailed;
use Laravel\Ai\Events\ToolInvoked;
use Laravel\Ai\Exceptions\RateLimitedException;
use Laravel\Ai\Responses\Data\ToolCall;

describe('Guard', function () {
    it('swallows and reports an Error, not only an Exception', function () {
        Exceptions::fake();

        Guard::run(fn () => throw new TypeError('not an exception'));

        Exceptions::assertReported(TypeError::class);
    });

    it('runs the callback', function () {
        $ran = false;

        Guard::run(function () use (&$ran) {
            $ran = true;
        });

        expect($ran)->toBeTrue();
    });

    it('survives report() itself throwing', function () {
        $this->app->instance(ExceptionHandler::class, new class implements ExceptionHandler
        {
            public function report(Throwable $e): void
            {
                throw new LogicException('the handler is broken');
            }

            public function shouldReport(Throwable $e): bool
            {
                return true;
            }

            public function render($request, Throwable $e): never
            {
                throw $e;
            }

            public function renderForConsole($output, Throwable $e): void {}
        });

        Guard::run(fn () => throw new RuntimeException('first'));

        expect(true)->toBeTrue();
    });
});

it('lets a run succeed when every Trail listener throws, and reports each failure', function () {
    Exceptions::fake();
    $this->app->instance(Recorder::class, new ThrowingRecorder($this->app, $this->app->make(CostCalculator::class)));

    AssistantAgent::fake([new ToolCall('call_1', 'lookup', ['query' => 'laravel']), 'Done']);

    $response = (new AssistantAgent([new LookupTool]))->prompt('Hi');

    // PromptingAgent, 2 x StartingStep, 2 x StepCompleted, InvokingTool, ToolInvoked and AgentPrompted.
    expect($response->text)->toBe('Done');

    Exceptions::assertReportedCount(8);
    Exceptions::assertReported(fn (TypeError $e) => $e->getMessage() === 'stepStarting failed');
    Exceptions::assertReported(fn (RuntimeException $e) => $e->getMessage() === 'agentStarting failed');
    Exceptions::assertReported(fn (TypeError $e) => $e->getMessage() === 'agentCompleted failed');
});

it('leaves a failing run\'s own exception untouched when every Trail listener throws', function () {
    Exceptions::fake();
    $this->app->instance(Recorder::class, new ThrowingRecorder($this->app, $this->app->make(CostCalculator::class)));

    FakeAnthropic::script([FakeAnthropic::error(429, 'Slow down')]);

    $thrown = Failures::thrown(fn () => (new AssistantAgent)->prompt('Hi'));

    // A throwing listener on StepFailed or AgentFailed would replace this exception if it were not guarded.
    expect($thrown)->toBeInstanceOf(RateLimitedException::class)
        ->and($this->sdk->sole(StepFailed::class)->event->exception)->toBe($thrown)
        ->and($this->sdk->sole(AgentFailed::class)->event->exception)->toBe($thrown);

    // PromptingAgent, StartingStep, StepFailed and AgentFailed.
    Exceptions::assertReportedCount(4);
    Exceptions::assertReported(fn (RuntimeException $e) => $e->getMessage() === 'agentFailed failed');
    Exceptions::assertReported(fn (TypeError $e) => $e->getMessage() === 'stepFailed failed');
});

it('leaves a failing tool\'s own exception untouched when every Trail listener throws', function () {
    Exceptions::fake();
    $this->app->instance(Recorder::class, new ThrowingRecorder($this->app, $this->app->make(CostCalculator::class)));

    FakeAnthropic::script([FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'explode', 'input' => []]])]);

    $tool = new CallbackTool('explode', fn () => throw new LogicException('Tool broke'));
    $thrown = Failures::thrown(fn () => (new AssistantAgent([$tool]))->prompt('Hi'));

    expect($thrown)->toBeInstanceOf(LogicException::class)
        ->and($thrown->getMessage())->toBe('Tool broke');

    Exceptions::assertReported(fn (RuntimeException $e) => $e->getMessage() === 'toolFailed failed');
});

it('leaves the failover untouched when the listener on it throws', function () {
    Exceptions::fake();
    $this->app->instance(Recorder::class, new ThrowingRecorder($this->app, $this->app->make(CostCalculator::class)));

    FakeAnthropic::script([FakeAnthropic::error(429), FakeAnthropic::text('ok')]);

    $response = (new AssistantAgent)->prompt('Hi', provider: ['anthropic' => 'model-a', 'backup' => 'model-b']);

    expect($response->text)->toBe('ok');

    Exceptions::assertReported(fn (TypeError $e) => $e->getMessage() === 'agentFailedOver failed');
});

it('lets a run succeed when the recorder cannot be resolved', function () {
    Exceptions::fake();
    $this->app->bind(Recorder::class, fn () => throw new RuntimeException('cannot build the recorder'));

    AssistantAgent::fake(['Hello']);

    expect((new AssistantAgent)->prompt('Hi')->text)->toBe('Hello');

    Exceptions::assertReported(fn (RuntimeException $e) => $e->getMessage() === 'cannot build the recorder');
});

it('lets a run succeed when the store throws, and reports it', function () {
    Exceptions::fake();
    $this->app->instance(TraceStore::class, new ThrowingStore);

    AssistantAgent::fake(['Hello']);

    expect((new AssistantAgent)->prompt('Hi')->text)->toBe('Hello');

    Exceptions::assertReported(fn (RecordingFailed $e) => str_contains($e->getMessage(), 'The store is down.'));
});

it('does not throw from Trail::flush when the recorder does', function () {
    Exceptions::fake();
    $this->app->instance(Recorder::class, new ThrowingRecorder($this->app, $this->app->make(CostCalculator::class)));

    Trail::flush();

    Exceptions::assertReported(fn (RuntimeException $e) => $e->getMessage() === 'flush failed');
});

it('loses only the trace that fails to store when several are flushed together', function () {
    Exceptions::fake();

    $real = $this->app->make(TraceStore::class);
    $this->app->instance(TraceStore::class, new FailsFirstStore($real));

    // Run "A" is a stream its consumer abandoned, so it is still in flight when run "B" finishes.
    $open = Streams::abandonedAfter(2);
    AssistantAgent::fake(['B done']);
    $finished = (new AssistantAgent)->prompt('B')->invocationId;

    Trail::flush();

    // Both runs inserted their start row. Run "A" is flushed first and fails to store: it stays a
    // running trace with no spans. Run "B" is stored complete.
    $probe = new DatabaseStoreProbe;

    Exceptions::assertReportedCount(1);
    expect($probe->trace($open)['status'])->toBe('running')
        ->and($probe->spans($open))->toBe([])
        ->and($probe->trace($finished)['status'])->toBe('completed')
        ->and(count($probe->spans($finished)))->toBe(2);
});

it('ignores events for an invocation it never saw start', function () {
    AssistantAgent::fake([new ToolCall('call_1', 'lookup', ['query' => 'laravel']), 'Done']);
    (new AssistantAgent([new LookupTool]))->prompt('Hi');
    Trail::flush();

    $probe = new DatabaseStoreProbe;
    expect([$probe->traceCount(), $probe->spanCount()])->toBe([1, 4]);

    Exceptions::fake();

    $completed = $this->sdk->of(StepCompleted::class)[0]->event;
    $invoked = $this->sdk->sole(ToolInvoked::class)->event;

    event(new StepCompleted('never-started', 0, $completed->agent, $completed->provider, $completed->model, false, $completed->response, 1.0));
    event(new ToolInvoked('never-started', 'tool-1', $invoked->agent, $invoked->tool, [], 'result', 1.0));
    Trail::flush();

    Exceptions::assertNothingReported();
    expect([$probe->traceCount(), $probe->spanCount()])->toBe([1, 4]);
});
