<?php

use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

function trailBackdate(string $table, string $id, string $createdAt): void
{
    DB::table($table)->where('id', $id)->update(['created_at' => $createdAt]);
}

it('marks stale running traces and spans as incomplete and abandoned', function () {
    $this->travelTo(Carbon::parse('2026-03-01 12:00:00'));
    config(['trail.stale_after' => 300]);

    $stale = Rows::trace(['id' => 'stale']);
    Rows::span($stale, ['id' => 'stale-span']);
    $fresh = Rows::trace(['id' => 'fresh']);
    Rows::span($fresh, ['id' => 'fresh-span']);
    $done = Rows::trace(['id' => 'done', 'status' => 'completed']);

    trailBackdate('trail_traces', 'stale', '2026-03-01 11:00:00.000');
    trailBackdate('trail_spans', 'stale-span', '2026-03-01 11:00:00.000');
    trailBackdate('trail_traces', 'done', '2026-03-01 11:00:00.000');

    $this->artisan('trail:sweep')
        ->expectsOutputToContain('Marked 1 running trace as incomplete.')
        ->assertSuccessful();

    expect(DB::table('trail_traces')->where('id', 'stale')->first())
        ->status->toBe('incomplete')
        ->issue_kind->toBe('abandoned')
        ->ended_at->toBeNull()
        ->duration_ms->toBeNull()
        ->and(DB::table('trail_spans')->where('id', 'stale-span')->value('status'))->toBe('incomplete')
        ->and(DB::table('trail_traces')->where('id', 'fresh')->value('status'))->toBe('running')
        ->and(DB::table('trail_spans')->where('id', 'fresh-span')->value('status'))->toBe('running')
        ->and(DB::table('trail_traces')->where('id', 'done')->value('status'))->toBe('completed');
});

it('reports zero when nothing is stale', function () {
    Rows::trace();

    $this->artisan('trail:sweep')->expectsOutputToContain('Marked 0 running traces as incomplete.')->assertSuccessful();

    expect(DB::table('trail_traces')->value('status'))->toBe('running');
});

it('treats a configured timeout below one minute as one minute', function () {
    $this->travelTo(Carbon::parse('2026-03-01 12:00:00'));
    config(['trail.stale_after' => 5]);

    Rows::trace(['id' => 'older']);
    Rows::trace(['id' => 'younger']);
    trailBackdate('trail_traces', 'older', '2026-03-01 11:58:59.000');
    trailBackdate('trail_traces', 'younger', '2026-03-01 11:59:30.000');

    $this->artisan('trail:sweep')->assertSuccessful();

    expect(DB::table('trail_traces')->where('id', 'older')->value('status'))->toBe('incomplete')
        ->and(DB::table('trail_traces')->where('id', 'younger')->value('status'))->toBe('running');
});

it('uses the configured timeout', function () {
    $this->travelTo(Carbon::parse('2026-03-01 12:00:00'));
    config(['trail.stale_after' => 7200]);

    Rows::trace(['id' => 'one-hour']);
    trailBackdate('trail_traces', 'one-hour', '2026-03-01 11:00:00.000');

    $this->artisan('trail:sweep')->assertSuccessful();

    expect(DB::table('trail_traces')->where('id', 'one-hour')->value('status'))->toBe('running');
});

it('works while recording is disabled', function () {
    $this->travelTo(Carbon::parse('2026-03-01 12:00:00'));
    config(['trail.enabled' => false, 'trail.stale_after' => 300]);

    Rows::trace(['id' => 'stale']);
    trailBackdate('trail_traces', 'stale', '2026-03-01 11:00:00.000');

    $this->artisan('trail:sweep')->assertSuccessful();

    expect(DB::table('trail_traces')->where('id', 'stale')->value('status'))->toBe('incomplete');
});
