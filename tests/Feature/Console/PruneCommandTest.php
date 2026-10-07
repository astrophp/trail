<?php

use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

function trailSeedAgedTraces(): void
{
    test()->travelTo(Carbon::parse('2026-03-01 12:00:00'));

    foreach (['old' => '2026-01-01 00:00:00.000', 'recent' => '2026-02-28 12:00:00.000'] as $id => $createdAt) {
        $trace = Rows::trace(['id' => $id]);
        Rows::span($trace, ['id' => "{$id}-span"]);
        Rows::bookmark($trace);

        DB::table('trail_traces')->where('id', $id)->update(['created_at' => $createdAt]);
    }
}

it('deletes traces older than the configured retention with their spans and bookmarks', function () {
    config(['trail.retention' => 30]);
    trailSeedAgedTraces();

    $this->artisan('trail:prune')
        ->expectsOutputToContain('Deleted 1 trace older than 720 hours.')
        ->assertSuccessful();

    expect(DB::table('trail_traces')->pluck('id')->all())->toBe(['recent'])
        ->and(DB::table('trail_spans')->pluck('id')->all())->toBe(['recent-span'])
        ->and(DB::table('trail_bookmarks')->pluck('trace_id')->all())->toBe(['recent']);
});

it('lets --hours override the retention', function () {
    config(['trail.retention' => 30]);
    trailSeedAgedTraces();

    $this->artisan('trail:prune', ['--hours' => '12'])
        ->expectsOutputToContain('Deleted 2 traces older than 12 hours.')
        ->assertSuccessful();

    expect(DB::table('trail_traces')->count())->toBe(0)
        ->and(DB::table('trail_spans')->count())->toBe(0)
        ->and(DB::table('trail_bookmarks')->count())->toBe(0);
});

it('accepts fractional hours', function () {
    $this->travelTo(Carbon::parse('2026-03-01 12:00:00'));
    Rows::trace(['id' => 'older']);
    Rows::trace(['id' => 'younger']);
    DB::table('trail_traces')->where('id', 'older')->update(['created_at' => '2026-03-01 11:20:00.000']);
    DB::table('trail_traces')->where('id', 'younger')->update(['created_at' => '2026-03-01 11:40:00.000']);

    $this->artisan('trail:prune', ['--hours' => '0.5'])->assertSuccessful();

    expect(DB::table('trail_traces')->pluck('id')->all())->toBe(['younger']);
});

it('rejects an invalid --hours and deletes nothing', function (string $hours) {
    trailSeedAgedTraces();

    $this->artisan('trail:prune', ['--hours' => $hours])
        ->expectsOutputToContain('The --hours option must be a number')
        ->assertFailed();

    expect(DB::table('trail_traces')->count())->toBe(2);
})->with(['abc', '-1', '-0.5', '1e999', '12h', '']);

it('works while recording is disabled', function () {
    config(['trail.enabled' => false, 'trail.retention' => 30]);
    trailSeedAgedTraces();

    $this->artisan('trail:prune')->assertSuccessful();

    expect(DB::table('trail_traces')->pluck('id')->all())->toBe(['recent']);
});

it('refuses to prune when the configured retention is not a positive number', function (mixed $retention) {
    config(['trail.retention' => $retention]);
    trailSeedAgedTraces();

    $this->artisan('trail:prune')
        ->expectsOutputToContain('trail.retention must be a positive number of days')
        ->expectsOutputToContain('--hours')
        ->assertFailed();

    expect(DB::table('trail_traces')->count())->toBe(2)
        ->and(DB::table('trail_spans')->count())->toBe(2)
        ->and(DB::table('trail_bookmarks')->count())->toBe(2);
})->with([0, -5, null, false, 'abc', '', 1e30, '1e999']);

it('still lets --hours prune when the configured retention is invalid', function () {
    config(['trail.retention' => 0]);
    trailSeedAgedTraces();

    $this->artisan('trail:prune', ['--hours' => '12'])->assertSuccessful();

    expect(DB::table('trail_traces')->count())->toBe(0);
});

it('keeps a trace exactly at the cut-off and deletes one a millisecond older', function () {
    $this->travelTo(Carbon::parse('2026-03-01 12:00:00'));

    foreach (['at-cutoff' => '2026-03-01 11:00:00.000', 'older' => '2026-03-01 10:59:59.999', 'newer' => '2026-03-01 11:00:00.001'] as $id => $createdAt) {
        Rows::trace(['id' => $id]);
        DB::table('trail_traces')->where('id', $id)->update(['created_at' => $createdAt]);
    }

    $this->artisan('trail:prune', ['--hours' => '1'])->expectsOutputToContain('Deleted 1 trace')->assertSuccessful();

    expect(DB::table('trail_traces')->orderBy('id')->pluck('id')->all())->toBe(['at-cutoff', 'newer']);
});
