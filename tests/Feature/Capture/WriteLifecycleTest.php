<?php

use Astro\Trail\Capture\Recorder;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Pricing\CostCalculator;
use Astro\Trail\Storage\Contracts\TraceStore;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Capture\Captured;
use Astro\Trail\Tests\Fixtures\Capture\FailsFirstStore;
use Astro\Trail\Tests\Fixtures\Capture\FailsOnStartStore;
use Astro\Trail\Tests\Fixtures\Capture\Queue\AgentJob;
use Astro\Trail\Tests\Fixtures\Capture\Queue\MemoryConnector;
use Astro\Trail\Tests\Fixtures\Capture\Queue\MemoryQueue;
use Astro\Trail\Tests\Fixtures\Capture\Queue\NoopJob;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Storage\DatabaseStoreProbe;
use Astro\Trail\Tests\Fixtures\Storage\Transactions;
use Astro\Trail\Tests\Fixtures\Tools\CallbackTool;
use Astro\Trail\Tests\Fixtures\Tools\LookupTool;
use Astro\Trail\TrailServiceProvider;
use Illuminate\Contracts\Events\Dispatcher;
use Illuminate\Database\Events\TransactionBeginning;
use Illuminate\Queue\Events\JobFailed;
use Illuminate\Queue\Events\JobProcessed;
use Illuminate\Queue\Events\Looping;
use Illuminate\Queue\WorkerOptions;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Route;
use Laravel\Ai\Responses\Data\ToolCall;
use Laravel\Octane\Contracts\OperationTerminated;

/*
|--------------------------------------------------------------------------
| The write lifecycle
|--------------------------------------------------------------------------
|
| One insert when a top-level run starts, everything else buffered and
| written in one batch at a flush point. Queue tests run a real worker
| over an in-memory queue, so no table is created inside the test's
| transaction.
|
*/

beforeEach(function () {
    $this->queue = new MemoryQueue;
    $this->app['queue']->extend('memory', fn () => new MemoryConnector($this->queue));

    config([
        'queue.connections.memory' => ['driver' => 'memory'],
        'queue.connections.inline' => ['driver' => 'sync'],
        'queue.failed.driver' => 'null',
    ]);

    $this->probe = new DatabaseStoreProbe;

    /** Run the next job on the memory queue with a real worker. */
    $this->work = fn (int $maxTries = 1) => $this->app->make('queue.worker')
        ->runNextJob('memory', 'default', new WorkerOptions(maxTries: $maxTries));

    /** The ids of the traces stored right now. */
    $this->traceIds = fn (): array => DB::table('trail_traces')->orderBy('started_at')->pluck('id')->all();

    Route::get('/agent', fn () => (new AssistantAgent)->prompt('Hi')->text);
});

afterEach(fn () => Carbon::setTestNow());

it('inserts the trace as the run starts, before any span is written', function () {
    $seen = null;

    $tool = new CallbackTool('lookup', function () use (&$seen) {
        $id = DB::table('trail_traces')->value('id');

        $seen = [$id === null ? null : $this->probe->trace($id), DB::table('trail_spans')->count()];

        return 'ok';
    });

    AssistantAgent::fake([new ToolCall('call_1', 'lookup', ['query' => 'x']), 'Done']);
    (new AssistantAgent([$tool]))->prompt('Hi', model: FakeAnthropic::MODEL);

    [$trace, $spans] = $seen;

    expect($trace)->not->toBeNull()
        ->and([$trace['status'], $trace['name'], $trace['agent_class'], $trace['provider'], $trace['model']])
        ->toBe(['running', 'AssistantAgent', AssistantAgent::class, 'anthropic', FakeAnthropic::MODEL])
        ->and($trace['started_at'])->toBeString()
        ->and([$trace['ended_at'], $trace['duration_ms'], $trace['span_count']])->toBe([null, null, 0])
        ->and($spans)->toBe(0);
});

it('writes nothing but the start row until a flush', function () {
    AssistantAgent::fake(['Hello']);

    $response = (new AssistantAgent)->prompt('Hi');
    $id = $response->invocationId;

    $before = $this->probe->trace($id);

    expect($before['status'])->toBe('running')
        ->and($before['span_count'])->toBe(0)
        ->and($this->probe->spans($id))->toBe([]);

    Trail::flush();

    $run = Captured::read($id)->assertVolatileColumns();

    expect($run->trace()['status'])->toBe('completed')
        ->and($run->trace()['span_count'])->toBe(2)
        ->and(array_column($run->spans(), 'type'))->toBe(['agent', 'step']);
});

it('issues exactly one query and begins no transaction while a run is in flight, and writes the rest at the flush', function () {
    config(['trail.pricing.anthropic' => [FakeAnthropic::MODEL => ['input' => 3.0, 'output' => 15.0]]]);

    FakeAnthropic::script([
        FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'a']]], usage: ['input_tokens' => 100, 'output_tokens' => 20]),
        FakeAnthropic::toolUse([['id' => 'toolu_2', 'name' => 'lookup', 'input' => ['query' => 'b']]], usage: ['input_tokens' => 120, 'output_tokens' => 20]),
        FakeAnthropic::text('Done', usage: ['input_tokens' => 140, 'output_tokens' => 5]),
    ]);

    // With no application transaction open, which is how a request or job really runs.
    Transactions::outside(function () {
        $queries = [];
        $began = 0;

        DB::listen(function ($query) use (&$queries) {
            $queries[] = $query->sql;
        });
        Event::listen(TransactionBeginning::class, function () use (&$began) {
            $began++;
        });

        (new AssistantAgent([new LookupTool, new LookupTool]))->prompt('Hi', model: FakeAnthropic::MODEL);

        expect($queries)->toHaveCount(1)
            ->and($queries[0])->toMatch('/^insert into ["`]?trail_traces/i')
            ->and($began)->toBe(0);

        $queries = [];
        Trail::flush();

        $run = Captured::read(DB::table('trail_traces')->value('id'));

        expect(implode("\n", $queries))->toContain('trail_spans')
            ->and($run->trace()['span_count'])->toBe(6)
            ->and($run->trace()['cost'])->not->toBeNull();
    });
});

it('flushes when a request ends', function () {
    AssistantAgent::fake(['Hello']);

    $this->get('/agent')->assertOk()->assertSee('Hello');

    $run = Captured::read(($this->traceIds)()[0])->assertVolatileColumns();

    expect($run->trace()['status'])->toBe('completed')
        ->and(array_column($run->spans(), 'sequence'))->toBe([1, 2]);
});

describe('a run that fails', function () {
    it('is written when the request ends in a 500', function () {
        FakeAnthropic::script([FakeAnthropic::error(500, 'Server error')]);
        Exceptions::fake();

        $this->get('/agent')->assertStatus(500);

        $run = Captured::read(($this->traceIds)()[0])->assertVolatileColumns();

        expect($run->trace()['status'])->toBe('failed')
            ->and($run->trace()['error_http_status'])->toBe(500)
            ->and(array_column($run->spans(), 'status'))->toBe(['failed', 'failed']);
    });

    it('is written by the job events when the job fails with an agent failure', function () {
        FakeAnthropic::script([FakeAnthropic::error(500, 'Server error')]);
        Exceptions::fake();
        dispatch((new AgentJob('succeed'))->onConnection('memory'));

        ($this->work)();

        $run = Captured::read(($this->traceIds)()[0])->assertVolatileColumns();

        expect($run->trace()['status'])->toBe('failed')
            ->and($run->trace()['error_source'])->toBe('step')
            ->and(array_column($run->spans(), 'status'))->toBe(['failed', 'failed']);
    });
});

describe('after the response', function () {
    it('flushes a run that a job dispatched after the response started', function () {
        AssistantAgent::fake(['Hello']);
        Route::get('/later', function () {
            dispatch(new AgentJob('succeed'))->afterResponse();

            return 'sent';
        });

        $this->get('/later')->assertOk()->assertSee('sent');

        $run = Captured::read(($this->traceIds)()[0])->assertVolatileColumns();

        expect($run->trace()['status'])->toBe('completed')->and($run->trace()['span_count'])->toBe(2);
    });

    it('flushes a run that a closure dispatched after the response started', function () {
        AssistantAgent::fake(['Hello']);
        Route::get('/later', function () {
            dispatch(fn () => (new AssistantAgent)->prompt('Hi'))->afterResponse();

            return 'sent';
        });

        $this->get('/later')->assertOk();

        $run = Captured::read(($this->traceIds)()[0])->assertVolatileColumns();

        expect($run->trace()['status'])->toBe('completed')->and($run->trace()['span_count'])->toBe(2);
    });
});

describe('queued jobs', function () {
    it('flush after a job that succeeds', function () {
        AssistantAgent::fake(['Hello']);
        dispatch((new AgentJob('succeed'))->onConnection('memory'));

        ($this->work)();

        $run = Captured::read(($this->traceIds)()[0])->assertVolatileColumns();

        expect($run->trace()['status'])->toBe('completed')->and($run->trace()['span_count'])->toBe(2);
    });

    it('flush after a job that fails for good', function () {
        AssistantAgent::fake(['Hello']);
        Exceptions::fake();
        dispatch((new AgentJob('fail'))->onConnection('memory'));

        ($this->work)();

        $run = Captured::read(($this->traceIds)()[0])->assertVolatileColumns();

        expect($run->trace()['status'])->toBe('completed')
            ->and($this->queue->size())->toBe(0);
    });

    it('flush after a job that throws and is released for another try', function () {
        AssistantAgent::fake(['Hello']);
        Exceptions::fake();
        dispatch((new AgentJob('retry'))->onConnection('memory'));

        ($this->work)(3);

        $run = Captured::read(($this->traceIds)()[0])->assertVolatileColumns();

        expect($run->trace()['status'])->toBe('completed')
            ->and($this->queue->size())->toBe(1);
    });

    it('write a run started by the failed hook of a job that fails for good', function () {
        AssistantAgent::fake(['Hello']);
        Exceptions::fake();
        dispatch((new AgentJob('fail-hook'))->onConnection('memory'));

        ($this->work)();

        $run = Captured::read(($this->traceIds)()[0])->assertVolatileColumns();

        expect($run->trace()['status'])->toBe('completed')->and($run->trace()['span_count'])->toBe(2);
    });

    it('flush when a job-failed event is raised by itself', function () {
        // In a worker the exception event follows this one, so only an event raised on its own
        // (a failure recorded outside the worker's own handling) shows that this listener flushes.
        // The event is built by hand around a real, non-sync job.
        dispatch((new AgentJob('succeed'))->onConnection('memory'));
        $job = $this->queue->pop();

        AssistantAgent::fake(['Hello']);
        (new AssistantAgent)->prompt('Hi');

        expect($this->probe->spanCount())->toBe(0);

        event(new JobFailed('memory', $job, new RuntimeException('failed elsewhere')));

        expect($this->probe->spanCount())->toBe(2);
    });

    it('write a queued prompt from the worker, with no explicit flush', function () {
        FakeAnthropic::script([FakeAnthropic::text('Hello from the worker')]);
        config(['queue.default' => 'memory']);

        (new AssistantAgent)->queue('Hi');

        expect($this->queue->size())->toBe(1)->and(($this->traceIds)())->toBe([]);

        ($this->work)();

        $run = Captured::read(($this->traceIds)()[0])->assertVolatileColumns();

        expect($run->trace()['status'])->toBe('completed')
            ->and($run->spans()[0]['output'])->toBe(['text' => 'Hello from the worker']);
    });

    it('flush between jobs when the worker loops', function () {
        AssistantAgent::fake(['Hello']);
        (new AssistantAgent)->prompt('Hi');

        expect(($this->traceIds)())->toHaveCount(1)
            ->and($this->probe->spanCount())->toBe(0);

        event(new Looping('memory', 'default'));

        expect($this->probe->spanCount())->toBe(2);
    });

    it('do not stop the worker loop', function () {
        expect($this->app->make(Dispatcher::class)->until(new Looping('memory', 'default')))->not->toBeFalse();
    });
});

describe('sync jobs', function () {
    beforeEach(function () {
        $this->runWithSyncJob = function (string $connection) {
            $inside = null;

            $tool = new CallbackTool('lookup', function () use ($connection, &$inside) {
                dispatch((new NoopJob)->onConnection($connection));

                $inside = DB::table('trail_spans')->count();

                return 'ok';
            });

            AssistantAgent::fake([new ToolCall('call_1', 'lookup', ['query' => 'x']), 'Done']);
            $response = (new AssistantAgent([$tool]))->prompt('Hi');

            Trail::flush();

            return [$response, $inside];
        };
    });

    it('do not flush the run they interrupt', function (string $connection) {
        [$response, $spansDuringRun] = ($this->runWithSyncJob)($connection);

        $run = Captured::read($response->invocationId)->assertVolatileColumns();

        expect($spansDuringRun)->toBe(0)
            ->and($run->trace()['status'])->toBe('completed')
            ->and(array_column($run->spans(), 'type'))->toBe(['agent', 'step', 'tool', 'step'])
            ->and(array_column($run->spans(), 'status'))->toBe(['completed', 'completed', 'completed', 'completed']);
    })->with([
        'the sync connection' => ['sync'],
        'a sync connection under another name' => ['inline'],
    ]);
});

it('flushes a trace that is still open as running, with the spans seen so far, and holds nothing afterwards', function () {
    $tool = new CallbackTool('lookup', function () {
        Trail::flush();

        return 'ok';
    });

    AssistantAgent::fake([new ToolCall('call_1', 'lookup', ['query' => 'x']), 'Done']);
    $response = (new AssistantAgent([$tool]))->prompt('Hi');

    $run = Captured::read($response->invocationId);

    $queries = 0;
    DB::listen(function () use (&$queries) {
        $queries++;
    });

    Trail::flush();

    expect($run->trace()['status'])->toBe('running')
        ->and($run->trace()['span_count'])->toBe(3)
        ->and(array_column($run->spans(), 'type'))->toBe(['agent', 'step', 'tool'])
        ->and(array_column($run->spans(), 'status'))->toBe(['running', 'completed', 'running'])
        ->and($response->text)->toBe('Done')
        ->and($queries)->toBe(0)
        ->and($this->probe->spanCount())->toBe(3);
});

it('shares no state between two requests in one process', function () {
    AssistantAgent::fake(['one', 'two']);

    $this->get('/agent')->assertOk();

    $queries = 0;
    DB::listen(function () use (&$queries) {
        $queries++;
    });

    // The first request's flush left nothing behind.
    Trail::flush();
    expect($queries)->toBe(0);

    $this->get('/agent')->assertOk();

    $ids = ($this->traceIds)();

    expect($ids)->toHaveCount(2);

    foreach ($ids as $id) {
        $run = Captured::read($id)->assertVolatileColumns();

        expect($run->trace()['status'])->toBe('completed')
            ->and(array_column($run->spans(), 'sequence'))->toBe([1, 2]);
    }

    expect($this->probe->spanCount())->toBe(4);
});

describe('when the store fails', function () {
    it('still answers the request when the batch write fails, and reports it', function () {
        Exceptions::fake();
        $this->app->instance(TraceStore::class, new FailsFirstStore($this->app->make(TraceStore::class)));
        AssistantAgent::fake(['Hello']);

        $this->get('/agent')->assertOk()->assertSee('Hello');

        Exceptions::assertReported(fn (RuntimeException $e) => $e->getMessage() === 'The first write fails.');
    });

    it('still runs, reports it and writes the trace at the flush when the start insert fails', function () {
        Exceptions::fake();
        $this->app->instance(TraceStore::class, new FailsOnStartStore($this->app->make(TraceStore::class)));
        AssistantAgent::fake(['Hello']);

        $response = (new AssistantAgent)->prompt('Hi');

        expect($response->text)->toBe('Hello')->and($this->probe->traceCount())->toBe(0);

        Trail::flush();

        Exceptions::assertReported(fn (RuntimeException $e) => $e->getMessage() === 'The start insert fails.');
        expect(Captured::read($response->invocationId)->trace()['status'])->toBe('completed');
    });
});

it('inserts the trace afresh at the flush when a transaction rolled the start row back', function () {
    AssistantAgent::fake(['Hello']);
    $id = null;

    try {
        DB::transaction(function () use (&$id) {
            $id = (new AssistantAgent)->prompt('Hi')->invocationId;

            throw new RuntimeException('roll back');
        });
    } catch (RuntimeException) {
        // The request failed after the run.
    }

    expect($this->probe->trace($id))->toBeNull();

    Trail::flush();

    $run = Captured::read($id)->assertVolatileColumns();

    expect($run->trace()['status'])->toBe('completed')->and($run->trace()['span_count'])->toBe(2);
});

describe('a late write', function () {
    /** A run whose start row is swept as abandoned from inside its tool, optionally flushing there. */
    function sweptRun(bool $flushWhileOpen): string
    {
        $tool = new CallbackTool('lookup', function () use ($flushWhileOpen) {
            Carbon::setTestNow(now()->addMinutes(10));
            app(TraceStore::class)->sweep(60);

            if ($flushWhileOpen) {
                Trail::flush();
            }

            return 'ok';
        });

        AssistantAgent::fake([new ToolCall('call_1', 'lookup', ['query' => 'x']), 'Done']);

        return (new AssistantAgent([$tool]))->prompt('Hi')->invocationId;
    }

    it('does not turn an incomplete trace back into running', function () {
        $id = sweptRun(flushWhileOpen: true);

        expect($this->probe->trace($id)['status'])->toBe('incomplete');

        Trail::flush();

        expect($this->probe->trace($id)['status'])->toBe('incomplete');
    });

    it('lets the run finish a trace that was swept while it was in flight', function () {
        $id = sweptRun(flushWhileOpen: false);

        expect($this->probe->trace($id)['status'])->toBe('incomplete');

        Trail::flush();

        $run = Captured::read($id);

        expect($run->trace()['status'])->toBe('completed')
            ->and(array_column($run->spans(), 'status'))->toBe(['completed', 'completed', 'completed', 'completed']);
    });
});

it('writes finished traces without a flush once a process holds more than its limit, and keeps open ones', function () {
    $this->app->instance(Recorder::class, new Recorder($this->app, $this->app->make(CostCalculator::class), 2));

    $inside = null;

    $tool = new CallbackTool('lookup', function () use (&$inside) {
        (new AssistantAgent)->prompt('B');

        $afterOne = DB::table('trail_spans')->count();

        (new AssistantAgent)->prompt('C');

        $inside = [$afterOne, DB::table('trail_spans')->count(), DB::table('trail_traces')->count()];

        return 'ok';
    });

    // The outer run is open while two inner runs finish: three traces are held, one more than the limit allows.
    AssistantAgent::fake([new ToolCall('call_1', 'lookup', ['query' => 'x']), 'B done', 'C done', 'A done']);
    $response = (new AssistantAgent([$tool]))->prompt('A');

    expect($inside)->toBe([0, 4, 3])
        ->and(DB::table('trail_spans')->where('trace_id', $response->invocationId)->count())->toBe(0);

    Trail::flush();

    expect(Captured::read($response->invocationId)->trace()['status'])->toBe('completed')
        ->and($this->probe->spanCount())->toBe(4 + 4);
});

describe('flush points', function () {
    it('registers the Octane listener under its own name and flushes when it is dispatched', function () {
        $name = 'Laravel\Octane\Contracts\OperationTerminated';

        expect($this->app->make(Dispatcher::class)->hasListeners($name))->toBeTrue();

        AssistantAgent::fake(['Hello']);
        (new AssistantAgent)->prompt('Hi');

        expect($this->probe->spanCount())->toBe(0);

        event($name);

        expect($this->probe->spanCount())->toBe(2);
    });

    it('delivers an event object that implements the Octane interface to the listener', function () {
        // The real interface is not installed, so a stand-in declares it for this test only.
        require_once __DIR__.'/../../Fixtures/Capture/Octane/OperationTerminated.php';

        AssistantAgent::fake(['Hello']);
        (new AssistantAgent)->prompt('Hi');

        expect($this->probe->spanCount())->toBe(0);

        event(new class implements OperationTerminated {});

        expect($this->probe->spanCount())->toBe(2);
    });

    it('registers a job listener for each end of a job', function () {
        expect($this->app->make(Dispatcher::class)->hasListeners(JobProcessed::class))->toBeTrue();
    });

    it('registers nothing when Trail is disabled', function () {
        $events = $this->app->make(Dispatcher::class);
        $terminating = new ReflectionProperty($this->app, 'terminatingCallbacks');
        $listeners = fn () => count($events->getListeners(JobProcessed::class)) + count($events->getListeners(Looping::class));

        $registered = [count($terminating->getValue($this->app)), $listeners()];

        config(['trail.enabled' => false]);
        (new TrailServiceProvider($this->app))->boot();

        expect([count($terminating->getValue($this->app)), $listeners()])->toBe($registered);

        // The same measure sees the registrations when Trail is enabled.
        config(['trail.enabled' => true]);
        (new TrailServiceProvider($this->app))->boot();

        expect(count($terminating->getValue($this->app)))->toBeGreaterThan($registered[0])
            ->and($listeners())->toBeGreaterThan($registered[1]);
    });
});
