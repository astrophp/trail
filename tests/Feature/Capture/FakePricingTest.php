<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\Pricing\PriceBook;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Http\UsageRows;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Illuminate\Database\ConnectionResolverInterface;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Database\QueryException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Exceptions;

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

    // The price book reads a connection that has no trail_prices table. Dropping the table instead
    // would end the test's transaction on MySQL (DDL commits) and leave the table gone for later tests.
    $this->withoutPriceTable = function (): void {
        config(['database.connections.trail_without_prices' => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '']]);

        $this->app->singleton(PriceBook::class, fn ($app) => new PriceBook(
            $app->make('config'),
            $app->make(ConnectionResolverInterface::class),
            'trail_without_prices',
        ));
    };

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

it('reports nothing to the exception handler while faked, with no saved prices table', function () {
    ($this->withoutPriceTable)();
    Exceptions::fake();
    Trail::fake();

    [$id, $queries] = ($this->run)();

    Exceptions::assertNothingReported();

    expect($queries)->toHaveCount(0)
        ->and(Trail::store()->totals($id)->cost)->toEqualWithDelta(CONFIG_COST, 1e-9);
});

it('reports the missing table when the same run is not faked', function () {
    ($this->withoutPriceTable)();
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

describe('the dashboard in a process that faked Trail', function () {
    beforeEach(function () {
        $this->app['env'] = 'testing';
        Trail::auth(fn () => true);

        Rows::price(['provider' => 'anthropic', 'model' => FakeAnthropic::MODEL, 'input' => 6, 'output' => 30]);
        Rows::price(['provider' => 'anthropic', 'model' => 'saved-only', 'input' => 1, 'output' => 2]);

        // Four steps of 1M tokens in and 100k out, in four complete hours of the projection's window.
        $this->spend = function (): void {
            Carbon::setTestNow('2026-01-02 12:30:00');

            foreach (['2026-01-02 06:10:00', '2026-01-02 08:20:00', '2026-01-02 09:30:00', '2026-01-02 11:45:00'] as $started) {
                UsageRows::run('Agent', $started, [
                    UsageRows::step('anthropic', FakeAnthropic::MODEL, ['inputTokens' => 1_000_000, 'outputTokens' => 100_000, 'cost' => 3.0]),
                ]);
            }
        };
    });

    afterEach(fn () => Carbon::setTestNow());

    it('still lists the saved prices and the saved-only models', function () {
        Trail::fake();

        $rows = collect($this->getJson('/trail/api/prices')->assertOk()->json('data'))->keyBy('model');

        expect($rows[FakeAnthropic::MODEL]['source'])->toBe('saved')
            ->and($rows['saved-only']['source'])->toBe('saved');
    });

    it('lists the config price for the same model when no saved row exists', function () {
        DB::table('trail_prices')->delete();
        Trail::fake();

        $rows = collect($this->getJson('/trail/api/prices')->assertOk()->json('data'))->keyBy('model');

        expect($rows->has('saved-only'))->toBeFalse()
            ->and($rows[FakeAnthropic::MODEL]['source'])->toBe('config');
    });

    it('answers a save with the saved price and deletes a saved-only model', function () {
        Trail::fake();

        $this->putJson('/trail/api/prices?provider=anthropic&model='.FakeAnthropic::MODEL, ['input' => 8, 'output' => 40])
            ->assertOk()
            ->assertJsonPath('data.source', 'saved');

        $this->deleteJson('/trail/api/prices?provider=anthropic&model=saved-only')->assertOk();

        expect(DB::table('trail_prices')->where('model', 'saved-only')->count())->toBe(0);
    });

    it('projects the spend at the saved price while a faked run is still priced from config', function () {
        ($this->spend)();
        $fake = Trail::fake();

        // 1M in at 6 and 100k out at 30 is 9 a step, 36 over the six hours of the window.
        expect($this->getJson('/trail/api/usage/spend')->assertOk()->json('data.projection.per_bucket'))->toEqual(6);

        [$id, $queries] = ($this->run)();

        expect($queries)->toHaveCount(0)
            ->and($fake->totals($id)->cost)->toEqualWithDelta(CONFIG_COST, 1e-9);
    });

    it('projects the spend at the config price when there is no saved row', function () {
        DB::table('trail_prices')->delete();
        ($this->spend)();
        Trail::fake();

        // 1M in at 3 and 100k out at 15 is 4.5 a step, 18 over the six hours of the window.
        expect($this->getJson('/trail/api/usage/spend')->assertOk()->json('data.projection.per_bucket'))->toEqual(3);
    });
});

it('prices the next run without a query when Trail is faked after a run was already priced', function () {
    ($this->run)();

    $fake = Trail::fake();

    [$id, $queries] = ($this->run)();

    expect($queries)->toHaveCount(0)
        ->and($fake->totals($id)->cost)->toEqualWithDelta(CONFIG_COST, 1e-9);
});

it('stays config-only when Trail is faked twice', function () {
    Rows::price(['provider' => 'anthropic', 'model' => FakeAnthropic::MODEL, 'input' => 6, 'output' => 30]);
    Trail::fake();
    $fake = Trail::fake();

    [$id, $queries] = ($this->run)();

    expect($queries)->toHaveCount(0)
        ->and($fake->totals($id)->cost)->toEqualWithDelta(CONFIG_COST, 1e-9);
});
