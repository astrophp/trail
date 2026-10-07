<?php

use Astro\Trail\Enums\IssueKind;
use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\Contracts\TraceStore;
use Astro\Trail\Storage\Models\Span;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Storage\StaleRuns;
use Astro\Trail\Tests\Fixtures\Storage\Records;
use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->travelTo(Carbon::parse('2026-03-01 12:00:00'));
    config(['trail.stale_after' => 300]);
});

function trailAge(string $id, string $createdAt): void
{
    DB::table('trail_traces')->where('id', $id)->update(['created_at' => $createdAt]);
    DB::table('trail_spans')->where('id', $id.'-span')->update(['created_at' => $createdAt]);
}

function trailPair(string $id, Status $status, string $createdAt, array $extra = []): void
{
    $trace = Rows::trace(['id' => $id, 'status' => $status] + $extra);
    Rows::span($trace, ['id' => $id.'-span', 'status' => $status] + $extra);
    trailAge($id, $createdAt);
}

it('reports a stale running trace and span as incomplete and abandoned', function () {
    trailPair('stale', Status::Running, '2026-03-01 11:00:00.000');

    foreach ([Trace::find('stale'), Span::find('stale-span')] as $row) {
        expect($row->status)->toBe(Status::Running)
            ->and($row->isStale())->toBeTrue()
            ->and($row->effectiveStatus())->toBe(Status::Incomplete)
            ->and($row->effectiveIssueKind())->toBe(IssueKind::Abandoned)
            ->and($row->ended_at)->toBeNull()
            ->and($row->duration_ms)->toBeNull();
    }
});

it('reports exactly what the sweep would write', function () {
    trailPair('stale', Status::Running, '2026-03-01 11:00:00.000');

    $trace = Trace::find('stale');
    $span = Span::find('stale-span');
    $effective = [$trace->effectiveStatus(), $trace->effectiveIssueKind(), $span->effectiveStatus(), $span->effectiveIssueKind()];

    expect(Trace::query()->whereEffectiveStatus(Status::Incomplete)->count())->toBe(1);

    $this->artisan('trail:sweep')->assertSuccessful();

    $swept = Trace::find('stale');
    $sweptSpan = Span::find('stale-span');

    expect($effective)->toBe([$swept->status, $swept->issue_kind, $sweptSpan->status, $sweptSpan->issue_kind])
        ->and($swept->ended_at)->toBeNull()
        ->and($swept->duration_ms)->toBeNull()
        ->and($swept->effectiveStatus())->toBe(Status::Incomplete)
        ->and($swept->effectiveIssueKind())->toBe(IssueKind::Abandoned)
        ->and(Trace::query()->whereEffectiveStatus(Status::Incomplete)->count())->toBe(1);
});

it('keeps a fresh running row running', function () {
    trailPair('fresh', Status::Running, '2026-03-01 11:58:00.000');

    foreach ([Trace::find('fresh'), Span::find('fresh-span')] as $row) {
        expect($row->isStale())->toBeFalse()
            ->and($row->effectiveStatus())->toBe(Status::Running)
            ->and($row->effectiveIssueKind())->toBeNull();
    }
});

it('never changes a final status or its issue kind', function (Status $status) {
    trailPair('final', $status, '2026-03-01 08:00:00.000', ['issue_kind' => IssueKind::ToolError]);

    foreach ([Trace::find('final'), Span::find('final-span')] as $row) {
        expect($row->isStale())->toBeFalse()
            ->and($row->effectiveStatus())->toBe($status)
            ->and($row->effectiveIssueKind())->toBe(IssueKind::ToolError);
    }

    expect(Trace::query()->whereEffectiveStatus($status)->count())->toBe(1)
        ->and(Trace::query()->whereEffectiveStatus(Status::Incomplete)->count())->toBe($status === Status::Incomplete ? 1 : 0)
        ->and(Trace::query()->whereEffectiveIssueKind(IssueKind::ToolError)->count())->toBe(1)
        ->and(Trace::query()->whereEffectiveIssueKind(IssueKind::Abandoned)->count())->toBe(0);
})->with([Status::Completed, Status::Failed, Status::Incomplete, Status::AwaitingApproval]);

it('puts the boundary at the cutoff, exclusive, to the millisecond', function () {
    trailPair('at-cutoff', Status::Running, '2026-03-01 11:55:00.000');
    trailPair('just-after', Status::Running, '2026-03-01 11:55:00.001');
    trailPair('just-before', Status::Running, '2026-03-01 11:54:59.999');

    expect(Trace::find('at-cutoff')->isStale())->toBeFalse()
        ->and(Span::find('at-cutoff-span')->effectiveStatus())->toBe(Status::Running)
        ->and(Trace::find('just-after')->isStale())->toBeFalse()
        ->and(Trace::find('just-before')->isStale())->toBeTrue()
        ->and(Span::find('just-before-span')->effectiveStatus())->toBe(Status::Incomplete)
        ->and(Trace::query()->whereEffectiveStatus(Status::Running)->orderBy('id')->pluck('id')->all())->toBe(['at-cutoff', 'just-after'])
        ->and(Trace::query()->whereEffectiveStatus(Status::Incomplete)->pluck('id')->all())->toBe(['just-before'])
        ->and(Span::query()->whereEffectiveStatus(Status::Running)->orderBy('id')->pluck('id')->all())->toBe(['at-cutoff-span', 'just-after-span'])
        ->and(Span::query()->whereEffectiveStatus(Status::Incomplete)->pluck('id')->all())->toBe(['just-before-span']);

    // Whatever the rule calls stale is exactly what the sweep marks.
    $this->artisan('trail:sweep')->assertSuccessful();

    expect(DB::table('trail_traces')->where('status', 'incomplete')->pluck('id')->all())->toBe(['just-before']);
});

it('filters queries by effective status without a sweep', function () {
    trailPair('stale', Status::Running, '2026-03-01 11:00:00.000');
    trailPair('fresh', Status::Running, '2026-03-01 11:58:00.000');
    trailPair('swept', Status::Incomplete, '2026-03-01 11:00:00.000');
    trailPair('done', Status::Completed, '2026-03-01 11:00:00.000');
    trailPair('failed', Status::Failed, '2026-03-01 11:00:00.000');

    $ids = fn (Status $status) => Trace::query()->whereEffectiveStatus($status)->orderBy('id')->pluck('id')->all();

    expect($ids(Status::Running))->toBe(['fresh'])
        ->and($ids(Status::Incomplete))->toBe(['stale', 'swept'])
        ->and($ids(Status::Completed))->toBe(['done'])
        ->and($ids(Status::Failed))->toBe(['failed'])
        ->and($ids(Status::AwaitingApproval))->toBe([])
        ->and(Span::query()->whereEffectiveStatus(Status::Incomplete)->orderBy('id')->pluck('id')->all())->toBe(['stale-span', 'swept-span'])
        ->and(Span::query()->whereEffectiveStatus(Status::Running)->pluck('id')->all())->toBe(['fresh-span']);
});

it('filters queries by effective issue kind', function () {
    trailPair('stale', Status::Running, '2026-03-01 11:00:00.000');
    trailPair('swept', Status::Incomplete, '2026-03-01 11:00:00.000', ['issue_kind' => IssueKind::Abandoned]);
    trailPair('errored', Status::Failed, '2026-03-01 11:00:00.000', ['issue_kind' => IssueKind::ToolError]);
    trailPair('fresh', Status::Running, '2026-03-01 11:58:00.000');
    // A running row that already carries an issue kind is abandoned once stale, as the sweep overwrites it.
    trailPair('stale-flagged', Status::Running, '2026-03-01 11:00:00.000', ['issue_kind' => IssueKind::ToolError]);

    $ids = fn (IssueKind $kind) => Trace::query()->whereEffectiveIssueKind($kind)->orderBy('id')->pluck('id')->all();

    expect($ids(IssueKind::Abandoned))->toBe(['stale', 'stale-flagged', 'swept'])
        ->and($ids(IssueKind::ToolError))->toBe(['errored'])
        ->and($ids(IssueKind::RateLimited))->toBe([])
        ->and(Trace::find('stale-flagged')->effectiveIssueKind())->toBe(IssueKind::Abandoned)
        ->and(Span::query()->whereEffectiveIssueKind(IssueKind::Abandoned)->orderBy('id')->pluck('id')->all())->toBe(['stale-flagged-span', 'stale-span', 'swept-span']);
});

it('keeps the scope grouped when combined with other conditions', function () {
    trailPair('stale', Status::Running, '2026-03-01 11:00:00.000');
    trailPair('other', Status::Completed, '2026-03-01 11:00:00.000');

    expect(Trace::query()->where('id', 'other')->whereEffectiveStatus(Status::Incomplete)->count())->toBe(0)
        ->and(Trace::query()->where('id', 'other')->whereEffectiveIssueKind(IssueKind::Abandoned)->count())->toBe(0)
        ->and(Trace::query()->where('id', 'stale')->whereEffectiveStatus(Status::Incomplete)->count())->toBe(1);
});

it('qualifies its columns so it works through a join', function () {
    trailPair('stale', Status::Running, '2026-03-01 11:00:00.000');

    expect(Span::query()->join('trail_traces', 'trail_traces.id', '=', 'trail_spans.trace_id')->whereEffectiveStatus(Status::Incomplete)->count())->toBe(1)
        ->and(Trace::query()->whereHas('spans', fn ($spans) => $spans->whereEffectiveStatus(Status::Incomplete))->count())->toBe(1);
});

it('applies a configured timeout below one minute as one minute', function () {
    config(['trail.stale_after' => 5]);

    trailPair('older', Status::Running, '2026-03-01 11:58:59.000');
    trailPair('younger', Status::Running, '2026-03-01 11:59:30.000');

    expect(StaleRuns::timeout())->toBe(60)
        ->and(Trace::find('older')->effectiveStatus())->toBe(Status::Incomplete)
        ->and(Trace::find('younger')->effectiveStatus())->toBe(Status::Running)
        ->and(Trace::query()->whereEffectiveStatus(Status::Incomplete)->pluck('id')->all())->toBe(['older'])
        ->and(Trace::query()->whereEffectiveStatus(Status::Running)->pluck('id')->all())->toBe(['younger']);
});

it('falls back to the default timeout when the config is not a number', function () {
    config(['trail.stale_after' => null]);

    expect(StaleRuns::timeout())->toBe(StaleRuns::DEFAULT_TIMEOUT_SECONDS);

    config(['trail.stale_after' => 'soon']);

    expect(StaleRuns::timeout())->toBe(StaleRuns::DEFAULT_TIMEOUT_SECONDS);
});

it('compares the stored string in the application timezone, whatever PHP defaults to', function () {
    // Only the config differs from PHP's default timezone (UTC), as in an app whose
    // default timezone was changed after boot. Stored values are in app.timezone.
    config(['app.timezone' => 'Europe/Istanbul']);
    $this->travelTo(Carbon::parse('2026-03-01 12:00:00', 'UTC'));

    // 12:00 UTC is 15:00 in Istanbul, so the cutoff is 14:55 there.
    trailPair('older', Status::Running, '2026-03-01 14:54:59.999');
    trailPair('younger', Status::Running, '2026-03-01 14:55:00.000');

    expect(date_default_timezone_get())->toBe('UTC')
        ->and(Trace::find('older')->isStale())->toBeTrue()
        ->and(Span::find('older-span')->isStale())->toBeTrue()
        ->and(Trace::find('younger')->isStale())->toBeFalse()
        ->and(Trace::query()->whereEffectiveStatus(Status::Incomplete)->pluck('id')->all())->toBe(['older']);
});

it('can call a scope statically', function () {
    trailPair('stale', Status::Running, '2026-03-01 11:00:00.000');

    expect(Trace::whereEffectiveStatus(Status::Incomplete)->pluck('id')->all())->toBe(['stale'])
        ->and(Span::whereEffectiveIssueKind(IssueKind::Abandoned)->pluck('id')->all())->toBe(['stale-span']);
});

it('pads stored datetimes that a driver returns with fewer fractional digits', function (string $stored, bool $stale) {
    expect(StaleRuns::isStale(Status::Running, $stored))->toBe($stale);
})->with([
    'no fraction, before' => ['2026-03-01 11:54:59', true],
    'no fraction, at cutoff' => ['2026-03-01 11:55:00', false],
    'one digit' => ['2026-03-01 11:54:59.9', true],
    'zero fraction at cutoff' => ['2026-03-01 11:55:00.0', false],
    'microseconds before' => ['2026-03-01 11:54:59.999999', true],
    'microseconds past cutoff' => ['2026-03-01 11:55:00.000999', false],
    'not a date' => ['soon', false],
]);

it('caps a huge configured timeout', function (mixed $configured) {
    config(['trail.stale_after' => $configured]);

    expect(StaleRuns::timeout())->toBe(StaleRuns::MAXIMUM_TIMEOUT_SECONDS)
        ->and(StaleRuns::cutoff()->year)->toBeLessThan(2026);
})->with(['1e30', 1e30, '1e999', PHP_INT_MAX]);

it('agrees with the store sweep for the same stored rows', function () {
    $store = app(TraceStore::class);

    $this->travelTo(Carbon::parse('2026-03-01 11:50:00'));
    $store->store(Records::trace(['id' => 'old']), [Records::span('old', ['id' => 'old-span', 'status' => Status::Running])]);

    $this->travelTo(Carbon::parse('2026-03-01 12:00:00'));

    $before = Trace::find('old')->effectiveStatus();
    $store->sweep(300);

    expect($before)->toBe(Status::Incomplete)
        ->and(Trace::find('old')->status)->toBe(Status::Incomplete)
        ->and(Span::find('old-span')->status)->toBe(Status::Incomplete);
});
