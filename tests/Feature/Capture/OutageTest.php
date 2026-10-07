<?php

use Astro\Trail\Capture\Recorder;
use Astro\Trail\Exceptions\RecordingFailed;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Pricing\CostCalculator;
use Astro\Trail\Storage\Contracts\TraceStore;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\CountingStore;
use Illuminate\Database\DeadlockException;
use Illuminate\Database\LostConnectionException;
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
    $this->queryError = fn (string $state, ?int $code = null, string $message = 'driver said no') => new QueryException('testing', 'insert into "trail_traces" values (?)', ['a secret prompt'], new class($message, $state, $code) extends PDOException
    {
        public function __construct(string $message, string $state, ?int $code)
        {
            parent::__construct($message);

            $this->code = $state;
            $this->errorInfo = [$state, $code ?? 0, $message];
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

it('treats only a database that cannot be written to at all as down', function (string $state, ?int $code, string $message, bool $down) {
    Exceptions::fake();
    $error = ($this->queryError)($state, $code, $message);
    $store = new CountingStore(onStart: fn () => throw $error);
    $this->app->instance(TraceStore::class, $store);

    ($this->run)();
    ($this->run)();

    expect($store->starts)->toBe($down ? 1 : 2);
})->with([
    'a connection that fails' => ['08006', null, 'connection failure', true],
    'MySQL: refused' => ['HY000', 2002, 'Connection refused', true],
    'MySQL: access denied' => ['28000', 1045, 'Access denied', true],
    'MySQL: unknown database' => ['42000', 1049, 'Unknown database', true],
    'MySQL: no such table' => ['42S02', 1146, 'Base table not found', true],
    'MySQL: gone away' => ['HY000', 2006, 'MySQL server has gone away', true],
    'MySQL: deadlock' => ['40001', 1213, 'Deadlock found', false],
    'MySQL: incorrect string value' => ['HY000', 1366, 'Incorrect string value', false],
    'MySQL: packet too large' => ['HY000', 1153, 'Got a packet bigger than max_allowed_packet', false],
    'MySQL: duplicate entry' => ['23000', 1062, 'Duplicate entry', false],
    'MySQL: lock wait timeout' => ['HY000', 1205, 'Lock wait timeout exceeded', false],
    'Postgres: no such table' => ['42P01', 7, 'undefined table', true],
    'Postgres: invalid password' => ['28P01', 7, 'password authentication failed', true],
    'Postgres: unknown database' => ['3D000', 7, 'database does not exist', true],
    'Postgres: serialization failure' => ['40001', 7, 'could not serialize access', false],
    'Postgres: deadlock' => ['40P01', 7, 'deadlock detected', false],
    'Postgres: row too big' => ['54000', 7, 'row is too big', false],
    'Postgres: invalid text' => ['22021', 7, 'invalid byte sequence', false],
    'Postgres: lock not available' => ['55P03', 7, 'could not obtain lock', false],
    'Postgres: syntax error' => ['42601', 7, 'syntax error', false],
    'SQLite: no such table' => ['HY000', 1, 'SQLSTATE[HY000]: General error: 1 no such table: trail_traces', true],
    'SQLite: cannot open the file' => ['HY000', 14, 'SQLSTATE[HY000] [14] unable to open database file', true],
    'SQLite: database is locked' => ['HY000', 5, 'SQLSTATE[HY000]: General error: 5 database is locked', false],
    'SQLite: constraint' => ['23000', 19, 'UNIQUE constraint failed: trail_traces.id', false],
]);

it('treats other exceptions as one trace\'s problem, except a lost connection', function (Throwable $error, bool $down) {
    Exceptions::fake();
    $store = new CountingStore(onStart: fn () => throw $error);
    $this->app->instance(TraceStore::class, $store);

    ($this->run)();
    ($this->run)();

    expect($store->starts)->toBe($down ? 1 : 2);
})->with([
    'an invalid argument' => [new InvalidArgumentException('Ids can be at most 64 characters long.'), false],
    'a runtime exception' => [new RuntimeException('anything'), false],
    'an error' => [new TypeError('wrong type'), false],
    'a raw PDOException with no state' => [new PDOException('some failure'), false],
    'a lost connection' => [new LostConnectionException('lost'), true],
    'a raw PDOException that is a refused connection' => [new PDOException('SQLSTATE[HY000] [2002] Connection refused'), true],
    'a raw PDOException the framework knows as a lost connection' => [new PDOException('SQLSTATE[HY000]: General error: 2006 MySQL server has gone away'), true],
]);

describe('what is reported of a failed write', function () {
    it('holds no value from the failure, whatever its type, and nothing is chained', function (Closure $make) {
        $report = RecordingFailed::because($make('LEAKED-MARKER'));

        expect($report->getMessage())->not->toContain('LEAKED-MARKER')
            ->and($report->getPrevious())->toBeNull();
    })->with([
        'a query error whose driver message has a value' => [fn (string $marker) => new QueryException('testing', 'insert into "trail_traces" values (?)', [$marker], new PDOException("Duplicate entry '{$marker}' for key 'PRIMARY'"))],
        'a deadlock made from a query error' => [fn (string $marker) => new DeadlockException("Deadlock found: insert into t values ('{$marker}')", 0, new QueryException('testing', 'insert into t values (?)', [$marker], new PDOException("Incorrect string value: '{$marker}' for column")))],
        'a raw PDOException' => [fn (string $marker) => new PDOException("Incorrect string value: '{$marker}' for column 'input'")],
    ]);

    it('says what kind of failure it was, where, and with which codes', function () {
        $error = new QueryException('testing', 'insert into "trail_traces" values (?)', ['LEAKED-MARKER'], new class('driver said no LEAKED-MARKER', 'HY000', 1366) extends PDOException
        {
            public function __construct(string $message, string $state, int $code)
            {
                parent::__construct($message);

                $this->errorInfo = [$state, $code, $message];
                $this->code = $state;
            }
        });
        $deadlock = new DeadlockException('wrapped', 0, $error);

        foreach ([$error, $deadlock] as $failure) {
            $message = RecordingFailed::because($failure)->getMessage();

            expect($message)->toContain('testing')->toContain('HY000')->toContain('1366')
                ->toContain('insert into "trail_traces" values (?)')
                ->toContain($failure::class)
                ->not->toContain('driver said no');
        }
    });

    it('keeps the message of an exception that is not a database error, since the store raises those about ids', function () {
        $message = RecordingFailed::because(new InvalidArgumentException('Ids can be at most 64 characters long.'))->getMessage();

        expect($message)->toContain('InvalidArgumentException')->toContain('Ids can be at most 64 characters long.');
    });

    it('reports a deadlock and a raw PDOException from a store as the stand-in', function (Throwable $error) {
        Exceptions::fake();
        $this->app->instance(TraceStore::class, new CountingStore(onStart: fn () => throw $error));

        ($this->run)();

        Exceptions::assertReported(fn (RecordingFailed $e) => ! str_contains($e->getMessage(), 'LEAKED-MARKER'));
        Exceptions::assertNotReported($error::class);
    })->with([
        'a deadlock' => [new DeadlockException('Deadlock LEAKED-MARKER')],
        'a PDOException' => [new PDOException('Incorrect string value LEAKED-MARKER')],
    ]);
});
