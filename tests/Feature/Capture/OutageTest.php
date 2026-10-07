<?php

use Astro\Trail\Capture\Recorder;
use Astro\Trail\Exceptions\RecordingFailed;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Pricing\CostCalculator;
use Astro\Trail\Storage\Contracts\TraceStore;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\CountingStore;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Exceptions;

/*
|--------------------------------------------------------------------------
| A store that is down
|--------------------------------------------------------------------------
|
| After a write fails like a database that is unavailable, Trail stops trying
| for a while: one failure is reported, and neither the early inserts nor the
| writes at a flush are attempted until the pause is over.
|
*/

beforeEach(function () {
    config(['cache.default' => 'array']);

    $this->now = 0;
    $this->app->instance(Recorder::class, new Recorder($this->app, $this->app->make(CostCalculator::class), clock: fn () => $this->now));

    $this->run = function () {
        AssistantAgent::fake(['Hello']);

        return (new AssistantAgent)->prompt('Hi')->text;
    };

    /** An exception from the driver that carries an SQLSTATE, as the database raises them. */
    $this->queryError = fn (string $state) => new QueryException('testing', 'insert into "trail_traces" values (?)', ['a secret prompt'], new class('driver said no', $state) extends PDOException
    {
        public function __construct(string $message, string $state)
        {
            parent::__construct($message);

            $this->code = $state;
        }
    });
});

it('stops attempting writes after the store fails like a database that is down, and tries again once the pause is over', function () {
    Exceptions::fake();
    $store = new CountingStore(onStart: fn () => throw new PDOException('SQLSTATE[HY000] [2002] Connection refused'), onStore: fn () => throw new PDOException('SQLSTATE[HY000] [2002] Connection refused'));
    $this->app->instance(TraceStore::class, $store);

    for ($i = 0; $i < 5; $i++) {
        expect(($this->run)())->toBe('Hello');
    }
    Trail::flush();

    // One attempt, one report; the other runs and the flush wrote nothing.
    expect([$store->starts, $store->stores])->toBe([1, 0]);
    Exceptions::assertReportedCount(1);

    $this->now += 31_000_000_000;

    ($this->run)();

    expect($store->starts)->toBe(2);
    Exceptions::assertReportedCount(2);
});

it('does not stop for a trace the store cannot take, so the traces beside it are still written', function () {
    Exceptions::fake();
    $store = new CountingStore(onStore: function (string $id, int $before) {
        if ($before === 0) {
            throw new InvalidArgumentException('a malformed record');
        }
    }, keepIds: true);
    $this->app->instance(TraceStore::class, $store);

    for ($i = 0; $i < 3; $i++) {
        ($this->run)();
    }
    Trail::flush();

    expect([$store->starts, $store->stores])->toBe([3, 3])
        ->and($store->stored)->toHaveCount(2);
    Exceptions::assertReportedCount(1);
});

it('treats a query error as the store being down, except a constraint or data error', function (string $state, bool $down) {
    Exceptions::fake();
    $error = ($this->queryError)($state);
    $store = new CountingStore(onStart: fn () => throw $error);
    $this->app->instance(TraceStore::class, $store);

    ($this->run)();
    ($this->run)();

    expect($store->starts)->toBe($down ? 1 : 2);
})->with([
    'a general error' => ['HY000', true],
    'a connection error' => ['08006', true],
    'a missing table' => ['42S02', true],
    'a constraint violation' => ['23000', false],
    'data that does not fit' => ['22001', false],
]);

it('reports a stand-in for a database error, with the statement but never its values and nothing chained', function () {
    $error = ($this->queryError)('HY000');

    $report = RecordingFailed::because($error);

    expect($report->getMessage())->toContain('insert into "trail_traces" values (?)')
        ->and($report->getMessage())->toContain('driver said no')
        ->and($report->getMessage())->toContain('testing')
        ->and($report->getMessage())->not->toContain('a secret prompt')
        ->and($report->getPrevious())->toBeNull();
});
