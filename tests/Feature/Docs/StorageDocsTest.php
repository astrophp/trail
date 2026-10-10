<?php

use App\Ai\Agents\SupportAgent;
use Astro\Trail\Enums\Status;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Storage\StaleRuns;
use Astro\Trail\Tests\Fixtures\Docs\Pages;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

require_once __DIR__.'/../../Fixtures/Docs/Agents.php';

/*
|--------------------------------------------------------------------------
| What the operations and limits pages say about storage
|--------------------------------------------------------------------------
|
| A dedicated storage connection, a transaction that rolls back, and the repeated hour of a clock
| change. The connections here are SQLite in memory, a database of its own each, which is enough to
| show whose transaction a write belongs to. The same was checked by hand on Postgres; see the page.
|
*/

afterEach(function () {
    Carbon::setTestNow();
    config(['trail.storage.connection' => null]);
});

/** A run inside a transaction on the default connection that is flushed there, then rolled back. */
function runFlushedInsideRolledBackTransaction(): void
{
    SupportAgent::fake(['Hello']);

    DB::connection()->beginTransaction();
    (new SupportAgent)->prompt('Hi');
    Trail::flush();
    DB::connection()->rollBack();
}

it('loses a trace flushed inside a transaction that rolls back, on the default connection', function () {
    $this->artisan('migrate')->assertSuccessful();

    runFlushedInsideRolledBackTransaction();

    expect(DB::table('trail_traces')->count())->toBe(0);
})->skip(fn () => DB::connection()->getDriverName() !== 'sqlite', 'uses in-memory SQLite databases as the two connections; on MySQL and Postgres both connections would be the same database');

it('keeps that trace when the tables are on the connection of the operations.connection sample', function () {
    // The sample's own line, run as written, before the migrations.
    eval(Pages::sample('operations.connection')['code']);

    config(['trail.storage.connection' => 'trail']);
    $this->artisan('migrate')->assertSuccessful();

    expect(config('database.connections.trail'))->toBe(config('database.connections.'.config('database.default')))
        ->and(DB::connection('trail')->getSchemaBuilder()->hasTable('trail_traces'))->toBeTrue()
        ->and(DB::connection()->getSchemaBuilder()->hasTable('trail_traces'))->toBeFalse();

    runFlushedInsideRolledBackTransaction();

    expect(DB::connection('trail')->table('trail_traces')->count())->toBe(1)
        ->and(DB::connection('trail')->table('trail_traces')->value('status'))->toBe('completed');
})->skip(fn () => DB::connection()->getDriverName() !== 'sqlite', 'uses in-memory SQLite databases as the two connections; on MySQL and Postgres both connections would be the same database');

it('writes the trace again at the flush when a transaction rolled the first row back, on the default connection', function () {
    $this->artisan('migrate')->assertSuccessful();
    SupportAgent::fake(['Hello']);

    try {
        DB::transaction(function () {
            (new SupportAgent)->prompt('Hi');

            throw new RuntimeException('roll back');
        });
    } catch (RuntimeException) {
    }

    expect(DB::table('trail_traces')->count())->toBe(0);

    Trail::flush();

    expect(DB::table('trail_traces')->value('status'))->toBe(Status::Completed->value);
})->skip(fn () => DB::connection()->getDriverName() !== 'sqlite', 'uses in-memory SQLite databases as the two connections; on MySQL and Postgres both connections would be the same database');

/** Whether a running row written at the first moment is stale at the second, by the sweep's own rule. */
function staleAt(string $writtenAt, string $now): bool
{
    Carbon::setTestNow(Carbon::parse($now));

    return StaleRuns::isStale(Status::Running, StaleRuns::format(Carbon::parse($writtenAt)));
}

it('sweeps late in the repeated hour of a clock change, as the limits page says', function () {
    // Europe/Berlin sets its clocks back on 2026-10-25 at 03:00 (summer time, UTC+2) to 02:00 (UTC+1).
    config(['app.timezone' => 'Europe/Berlin', 'trail.stale_after' => 3600]);

    $written = '2026-10-25 02:55:00 +02:00';

    expect(StaleRuns::format(Carbon::parse($written)))->toBe('2026-10-25 02:55:00.000')
        // 02:55:01 winter time is an hour and a second after the row was written.
        ->and(staleAt($written, '2026-10-25 02:55:01 +01:00'))->toBeTrue()
        // At 03:10 winter time the row is 75 minutes old, but its stored 02:55 is not before the cutoff, 02:10.
        ->and(staleAt($written, '2026-10-25 03:10:00 +01:00'))->toBeFalse()
        // The wall clock passes 02:55 again an hour later, when the row is two hours old.
        ->and(staleAt($written, '2026-10-25 03:56:00 +01:00'))->toBeTrue();

    // With no daylight saving the same age is stale at once.
    config(['app.timezone' => 'UTC']);

    expect(staleAt('2026-10-25 00:55:00 UTC', '2026-10-25 02:10:00 UTC'))->toBeTrue();
});

it('gives the size of the dashboard bundle to within a tenth of what is built', function () {
    $page = Pages::read(Pages::root().'/docs/limits.md');
    $within = fn (float $documented, float $actual) => abs($documented - $actual) / $actual <= 0.1;

    preg_match('/script is about [\d.]+ MB \(([\d,]+) bytes\), about (\d+) KB gzipped/', $page, $script);
    preg_match('/stylesheet is about (\d+) KB, about (\d+) KB\s+gzipped/', $page, $style);

    expect($script)->not->toBeEmpty()->and($style)->not->toBeEmpty();

    $js = Pages::read(Pages::root().'/dist/app.js');
    $css = Pages::read(Pages::root().'/dist/app.css');

    expect($within((float) str_replace(',', '', $script[1]), strlen($js)))->toBeTrue('The script size on the limits page is out of date.')
        ->and($within((float) $script[2] * 1000, strlen((string) gzencode($js, 6))))->toBeTrue('The gzipped script size on the limits page is out of date.')
        ->and($within((float) $style[1] * 1000, strlen($css)))->toBeTrue('The stylesheet size on the limits page is out of date.')
        ->and($within((float) $style[2] * 1000, strlen((string) gzencode($css, 6))))->toBeTrue('The gzipped stylesheet size on the limits page is out of date.');
});
