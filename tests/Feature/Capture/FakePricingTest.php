<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\Pricing\PriceBook;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Schema;

/*
|--------------------------------------------------------------------------
| A faked Trail prices from config and reads no table
|--------------------------------------------------------------------------
|
| Trail::fake() stands in for the whole of Trail's storage, saved prices included, so an
| application's tests never query Trail's tables, even one that does not run its migrations.
|
*/

beforeEach(function () {
    config(['trail.pricing.anthropic' => [FakeAnthropic::MODEL => ['input' => 3.0, 'output' => 15.0]]]);

    // One step with usage, recorded and flushed; every query that runs meanwhile is returned.
    $this->run = function (): array {
        $queries = [];
        DB::listen(function (QueryExecuted $query) use (&$queries) {
            $queries[] = $query->sql;
        });

        FakeAnthropic::script([FakeAnthropic::text('ok', usage: ['input_tokens' => 1234, 'output_tokens' => 567])]);

        $id = (new AssistantAgent)->prompt('Hi', model: FakeAnthropic::MODEL)->invocationId;
        Trail::flush();

        return [$id, $queries];
    };
});

// 1234 x 3 + 567 x 15 per million tokens.
const CONFIG_COST = 0.012207;
// 1234 x 6 + 567 x 30 per million tokens.
const SAVED_COST = 0.024414;

it('prices a faked run from config with no query on any connection', function () {
    $fake = Trail::fake();

    [$id, $queries] = ($this->run)();

    expect($queries)->toHaveCount(0)
        ->and($fake->totals($id)->cost)->toEqualWithDelta(CONFIG_COST, 1e-9);
});

it('reads the saved prices when the same run is not faked', function () {
    [$id, $queries] = ($this->run)();

    $priceQueries = array_filter($queries, fn (string $sql) => str_contains($sql, 'trail_prices'));

    expect($priceQueries)->toHaveCount(1)
        ->and((float) DB::table('trail_traces')->where('id', $id)->value('cost'))->toEqualWithDelta(CONFIG_COST, 1e-9);
});

it('reports nothing to the exception handler while faked, with the saved prices table dropped', function () {
    Schema::drop('trail_prices');
    Exceptions::fake();
    Trail::fake();

    [$id, $queries] = ($this->run)();

    Exceptions::assertNothingReported();

    expect($queries)->toHaveCount(0)
        ->and(Trail::store()->totals($id)->cost)->toEqualWithDelta(CONFIG_COST, 1e-9);
});

it('reports the missing table when the same run is not faked', function () {
    Schema::drop('trail_prices');
    Exceptions::fake();

    ($this->run)();

    Exceptions::assertReported(fn (QueryException $e) => str_contains($e->getMessage(), 'trail_prices'));
});

it('does not use a saved price while faked', function () {
    Rows::price(['provider' => 'anthropic', 'model' => FakeAnthropic::MODEL, 'input' => 6, 'output' => 30]);
    $fake = Trail::fake();

    [$id] = ($this->run)();

    expect($fake->totals($id)->cost)->toEqualWithDelta(CONFIG_COST, 1e-9);
});

it('uses a saved price when not faked', function () {
    Rows::price(['provider' => 'anthropic', 'model' => FakeAnthropic::MODEL, 'input' => 6, 'output' => 30]);

    [$id] = ($this->run)();

    expect((float) DB::table('trail_traces')->where('id', $id)->value('cost'))->toEqualWithDelta(SAVED_COST, 1e-9);
});

it('stays config-only in a long-lived process once the refresh interval has passed', function () {
    Rows::price(['provider' => 'anthropic', 'model' => FakeAnthropic::MODEL, 'input' => 6, 'output' => 30]);
    $fake = Trail::fake();

    [$first] = ($this->run)();

    $this->travel(PriceBook::REFRESH_SECONDS + 1)->seconds();

    [$second, $queries] = ($this->run)();

    expect($queries)->toHaveCount(0)
        ->and($fake->totals($first)->cost)->toEqualWithDelta(CONFIG_COST, 1e-9)
        ->and($fake->totals($second)->cost)->toEqualWithDelta(CONFIG_COST, 1e-9);
});
