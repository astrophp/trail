<?php

use Astro\Trail\Capture\Recorder;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Pricing\CostCalculator;
use Astro\Trail\Pricing\PriceBook;
use Astro\Trail\Storage\Contracts\TraceStore;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\CountingStore;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\Replay;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\Reports;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\Scenarios;
use Astro\Trail\Tests\Fixtures\Capture\Queue\AgentJob;
use Astro\Trail\Tests\Fixtures\Capture\Queue\MemoryConnector;
use Astro\Trail\Tests\Fixtures\Capture\Queue\MemoryQueue;
use Astro\Trail\Tests\Fixtures\Storage\DatabaseStoreProbe;
use Illuminate\Queue\WorkerOptions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Ai\Exceptions\RateLimitedException;

/*
|--------------------------------------------------------------------------
| A store that fails at every point
|--------------------------------------------------------------------------
|
| Whatever the store does, the caller of the AI call sees exactly what it would
| have seen without Trail: the same return value, or the same exception.
|
*/

beforeEach(function () {
    config(['cache.default' => 'array']);

    $this->reports = Reports::capture();
});

/** Every way a store can fail: [start fails, store fails, which store call fails, what it throws]. */
dataset('failing stores', [
    'start throws an Exception' => [fn () => CountingStore::throwing(new RuntimeException('start is down'), store: false)],
    'start throws an Error' => [fn () => CountingStore::throwing(new TypeError('start is broken'), store: false)],
    'store throws an Exception' => [fn () => CountingStore::throwing(new RuntimeException('store is down'), start: false)],
    'store throws an Error' => [fn () => CountingStore::throwing(new TypeError('store is broken'), start: false)],
    'both throw Errors' => [fn () => CountingStore::throwing(new ArgumentCountError('both are broken'))],
    'both throw an AssertionError' => [fn () => CountingStore::throwing(new AssertionError('both are broken'))],
]);

it('gives the caller what it gets without Trail, whichever way the store fails, for every run shape', function (Closure $store, string $shape) {
    $this->app->instance(TraceStore::class, $store());

    $call = Scenarios::all()[$shape];

    $withTrail = $call();
    Trail::flush();

    Replay::detach();
    $without = $call();

    expect($withTrail)->toEqual($without);
    // One cause, at most one report per write: the start insert and the batch write.
    expect($this->reports->count())->toBeLessThanOrEqual(2, implode(' | ', $this->reports->messages()));
})->with('failing stores')->with(array_keys(Scenarios::all()));

it('stores the first and third trace when only the second store call fails', function () {
    $store = new CountingStore(onStore: function (string $id, int $before) {
        if ($before === 1) {
            throw new TypeError('the second write fails');
        }
    }, keepIds: true);
    $this->app->instance(TraceStore::class, $store);

    Scenarios::hello();
    Scenarios::hello();
    Scenarios::hello();
    Trail::flush();

    expect($store->stores)->toBe(3)
        ->and($store->stored)->toHaveCount(2)
        ->and($this->reports->count())->toBe(1);
});

it('does not turn a failing run\'s own exception into the store\'s, and does not swallow it', function () {
    $this->app->instance(TraceStore::class, CountingStore::throwing(new LogicException('store replaced my exception')));

    $withTrail = Scenarios::failing();

    Replay::detach();
    $without = Scenarios::failing();

    expect($withTrail[0])->toBe(RateLimitedException::class)
        ->and($withTrail)->toEqual($without);
});

describe('queued', function () {
    beforeEach(function () {
        $this->queue = new MemoryQueue;
        $this->app['queue']->extend('memory', fn () => new MemoryConnector($this->queue));

        config([
            'queue.connections.memory' => ['driver' => 'memory'],
            'queue.failed.driver' => 'null',
        ]);
    });

    it('completes a job whose store throws at both points, without a failed job and without a retry', function () {
        $this->app->instance(TraceStore::class, CountingStore::throwing(new TypeError('the store is broken')));

        AssistantAgent::fake(['Hello']);
        dispatch((new AgentJob('succeed'))->onConnection('memory'));

        $this->app->make('queue.worker')->runNextJob('memory', 'default', new WorkerOptions(maxTries: 1));

        expect($this->queue->size())->toBe(0)
            ->and($this->reports->count())->toBeLessThanOrEqual(2);
    });
});

describe('a store that hangs', function () {
    it('is not asked again for every run once it has failed like a database that is down, so an outage costs one wait and not one per run', function () {
        $store = new CountingStore(
            onStart: function () {
                usleep(30_000);

                throw new PDOException('SQLSTATE[HY000] [2002] timed out');
            },
            onStore: function () {
                usleep(30_000);

                throw new PDOException('SQLSTATE[HY000] [2002] timed out');
            },
        );
        $this->app->instance(TraceStore::class, $store);

        $elapsed = Replay::ms(function () {
            for ($i = 0; $i < 10; $i++) {
                Scenarios::hello();
            }
        });
        $flush = Replay::ms(fn () => Trail::flush());

        Replay::say(sprintf('a store that waits 30 ms then fails, 10 runs: %.0f ms inside the calls (%d start attempts), %.0f ms in the flush (%d store attempts), %d reports', $elapsed, $store->starts, $flush, $store->stores, $this->reports->count()));

        // Ten runs against a store that has just timed out ten times: the wait is paid by every one of them.
        expect($store->starts)->toBeLessThanOrEqual(3)
            ->and($store->stores)->toBeLessThanOrEqual(3);
    });

    it('reports one outage a handful of times, not once per run', function () {
        $this->app->instance(TraceStore::class, CountingStore::throwing(new PDOException('SQLSTATE[HY000] [2002] Connection refused')));

        for ($i = 0; $i < 100; $i++) {
            Scenarios::hello();
        }
        Trail::flush();

        Replay::say('100 runs against a store that is down: '.$this->reports->count().' reports');

        expect($this->reports->count())->toBeLessThanOrEqual(10);
    });
});

describe('the database', function () {
    beforeEach(function () {
        $this->useConnection = function (string $name) {
            config(['trail.storage.connection' => $name]);

            foreach ([TraceStore::class, PriceBook::class, CostCalculator::class, Recorder::class] as $abstract) {
                $this->app->forgetInstance($abstract);
            }
        };
    });

    it('can be unreachable: the call is untouched, the writes are reported', function (string $shape) {
        config(['database.connections.trail_down' => ['driver' => 'sqlite', 'database' => '/nonexistent-trail-directory/trail.sqlite', 'prefix' => '']]);
        ($this->useConnection)('trail_down');

        $call = Scenarios::all()[$shape];

        $withTrail = $call();
        Trail::flush();

        Replay::detach();
        $without = $call();

        expect($withTrail)->toEqual($without)
            ->and($this->reports->count())->toBeGreaterThan(0)
            ->and($this->reports->count())->toBeLessThanOrEqual(3, implode(' | ', $this->reports->messages()));
    })->with(array_keys(Scenarios::all()));

    it('can be missing its tables: the call is untouched and the reports are few', function (string $shape) {
        config(['database.connections.trail_empty' => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '']]);
        ($this->useConnection)('trail_empty');

        $call = Scenarios::all()[$shape];

        $withTrail = $call();
        Trail::flush();

        Replay::detach();
        $without = $call();

        expect($withTrail)->toEqual($without)
            ->and($this->reports->count())->toBeGreaterThan(0)
            ->and($this->reports->count())->toBeLessThanOrEqual(3, implode(' | ', $this->reports->messages()));
    })->with(array_keys(Scenarios::all()));

    it('can be missing its tables: the application\'s transaction on the same connection is not left open or poisoned', function (string $shape) {
        Schema::drop('trail_spans');
        Schema::drop('trail_traces');
        Schema::drop('trail_prices');
        DB::statement('create table scratch (id integer primary key)');

        $level = DB::transactionLevel();
        $call = Scenarios::all()[$shape];

        $withTrail = $call();
        $afterCall = DB::transactionLevel();
        Trail::flush();
        $afterFlush = DB::transactionLevel();

        // The application's own work in the same transaction still goes through.
        DB::table('scratch')->insert(['id' => 1]);

        Replay::detach();
        $without = $call();

        expect($withTrail)->toEqual($without)
            ->and($afterCall)->toBe($level)
            ->and($afterFlush)->toBe($level)
            ->and(DB::table('scratch')->count())->toBe(1)
            ->and($this->reports->count())->toBeGreaterThan(0);
    })->skip(fn () => DB::connection()->getDriverName() !== 'sqlite', 'drops tables inside the test, which MySQL commits; Postgres is covered by TransactionSafetyTest')->with(array_keys(Scenarios::all()));

    it('leaves the application\'s transaction usable when a user rolls back around a recorded call', function () {
        $probe = new DatabaseStoreProbe;
        $id = null;

        try {
            DB::transaction(function () use (&$id) {
                AssistantAgent::fake(['Hello']);
                $id = (new AssistantAgent)->prompt('Hi')->invocationId;

                throw new RuntimeException('the application rolls back');
            });
        } catch (RuntimeException) {
        }

        Trail::flush();

        // The start row went with the rollback; the flush wrote the trace afresh.
        expect($probe->trace($id)['status'])->toBe('completed')
            ->and($this->reports->count())->toBe(0);
    });
});

describe('the price book', function () {
    it('can be missing its table: the trace is stored unpriced and the failure is reported once', function () {
        Schema::drop('trail_prices');

        $probe = new DatabaseStoreProbe;

        for ($i = 0; $i < 5; $i++) {
            Scenarios::plain();
        }
        Trail::flush();

        expect($probe->traceCount())->toBe(5)
            ->and($this->reports->count())->toBeLessThanOrEqual(1, implode(' | ', $this->reports->messages()));
    })->skip(fn () => DB::connection()->getDriverName() !== 'sqlite', 'drops a table inside the test, which MySQL commits');

    it('can hold garbage rows: the trace is stored and the garbage prices nothing', function () {
        DB::table('trail_prices')->insert([
            ['provider' => 'anthropic', 'model' => 'claude-test-requested', 'input' => 'abc', 'output' => '-5', 'cache_read' => 'NaN', 'cache_write' => '1e999', 'created_at' => now(), 'updated_at' => now()],
        ]);

        $probe = new DatabaseStoreProbe;

        Scenarios::plain();
        Trail::flush();

        $trace = $probe->trace(DB::table('trail_traces')->value('id'));

        expect($trace['status'])->toBe('completed')
            ->and($trace['cost'])->toBeNull()
            ->and($this->reports->count())->toBe(0);
    })->skip(fn () => DB::connection()->getDriverName() !== 'sqlite', 'other databases refuse text in numeric columns');

    it('can throw from the calculator: the trace is still written, unpriced', function () {
        $this->app->instance(CostCalculator::class, new class($this->app->make(PriceBook::class)) extends CostCalculator
        {
            public function cost(string $provider, string $model, ?int $inputTokens, ?int $outputTokens, ?int $cacheReadTokens = null, ?int $cacheWriteTokens = null): ?float
            {
                throw new Error('the price book is broken');
            }
        });
        $this->app->forgetInstance(Recorder::class);

        $probe = new DatabaseStoreProbe;

        Scenarios::plain();
        Trail::flush();

        expect($probe->traceCount())->toBe(1)
            ->and($probe->spanCount())->toBeGreaterThan(0)
            ->and($this->reports->count())->toBeLessThanOrEqual(1);
    });
});
