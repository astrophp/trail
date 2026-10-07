<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Exceptions;

/*
|--------------------------------------------------------------------------
| Trail's writes inside the application's transaction
|--------------------------------------------------------------------------
|
| On Postgres, a statement that fails aborts the whole transaction it ran in
| unless it ran in a savepoint, and every later statement is refused. Trail's
| writes must never leave the application's own transaction in that state.
| These tests break Trail's tables from inside the transaction (Postgres can
| undo DDL) and then run the application's own query in the same transaction.
|
*/

beforeEach(function () {
    config(['cache.default' => 'array']);

    $this->away = fn (string $table) => DB::statement("alter table {$table} rename to {$table}_away");
    $this->back = fn (string $table) => DB::statement("alter table {$table}_away rename to {$table}");

    $this->run = function () {
        AssistantAgent::fake(['Hello']);

        return (new AssistantAgent)->prompt('Hi')->text;
    };
});

it('stays usable when the early insert fails', function () {
    Exceptions::fake();
    ($this->away)('trail_traces');

    expect(($this->run)())->toBe('Hello')
        ->and(DB::select('select 1 as one')[0]->one)->toBe(1);

    Exceptions::assertReportedCount(1);
    ($this->back)('trail_traces');
})->skip(fn () => DB::connection()->getDriverName() !== 'pgsql', 'only Postgres refuses statements after a failed one');

it('stays usable when the write at the flush fails', function () {
    Exceptions::fake();

    expect(($this->run)())->toBe('Hello');

    ($this->away)('trail_traces');
    Trail::flush();

    expect(DB::select('select 1 as one')[0]->one)->toBe(1);

    Exceptions::assertReportedCount(1);
    ($this->back)('trail_traces');
})->skip(fn () => DB::connection()->getDriverName() !== 'pgsql', 'only Postgres refuses statements after a failed one');

it('stays usable, and stores the trace, when looking up the prices fails', function () {
    Exceptions::fake();
    ($this->away)('trail_prices');

    // A run with usage is priced, which reads the saved prices.
    FakeAnthropic::script([FakeAnthropic::text('Hello', usage: ['input_tokens' => 10, 'output_tokens' => 5])]);

    expect((new AssistantAgent)->prompt('Hi', model: FakeAnthropic::MODEL)->text)->toBe('Hello');
    Trail::flush();

    expect(DB::select('select 1 as one')[0]->one)->toBe(1)
        ->and(DB::table('trail_traces')->count())->toBe(1);

    ($this->back)('trail_prices');
})->skip(fn () => DB::connection()->getDriverName() !== 'pgsql', 'only Postgres refuses statements after a failed one');
