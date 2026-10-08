<?php

use Astro\Trail\Enums\Status;
use Astro\Trail\Http\Resources\OverviewResource;
use Astro\Trail\Queries\OverviewQuery;
use Astro\Trail\Queries\RunScope;
use Astro\Trail\Queries\TimeRange;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

beforeEach(function () {
    $this->app['env'] = 'local';
    Carbon::setTestNow('2026-01-02 12:34:56');
});

afterEach(function () {
    Carbon::setTestNow();
    $this->app['env'] = 'testing';
});

/**
 * Runs of two agents in the range and in the period before it. Alpha has twenty measured runs in
 * each, so both of its percentiles are computed.
 */
function overviewScopeDataset(): void
{
    foreach (range(1, 20) as $i) {
        Rows::trace(['id' => "alpha-now-{$i}", 'name' => 'Alpha', 'status' => Status::Completed, 'started_at' => '2026-01-02 10:00:00', 'duration_ms' => $i * 10, 'input_tokens' => 5, 'cost' => 0.01]);
        Rows::trace(['id' => "alpha-before-{$i}", 'name' => 'Alpha', 'status' => Status::Failed, 'started_at' => '2026-01-01 10:00:00', 'duration_ms' => $i * 100]);
        Rows::trace(['id' => "beta-now-{$i}", 'name' => 'Beta', 'status' => Status::Failed, 'started_at' => '2026-01-02 10:30:00', 'duration_ms' => 9000 + $i, 'unpriced_span_count' => 1]);
        Rows::trace(['id' => "beta-before-{$i}", 'name' => 'Beta', 'status' => Status::Completed, 'started_at' => '2026-01-01 10:30:00', 'duration_ms' => 9000 + $i]);
    }

    Rows::trace(['id' => 'alpha-running', 'name' => 'Alpha', 'status' => Status::Running, 'started_at' => '2026-01-02 12:00:00']);
    Rows::trace(['id' => 'alpha-stale', 'name' => 'Alpha', 'status' => Status::Running, 'started_at' => '2026-01-02 09:00:00', 'created_at' => Carbon::now()->subHours(3)]);
    Rows::trace(['id' => 'beta-awaiting', 'name' => 'Beta', 'status' => Status::AwaitingApproval, 'started_at' => '2026-01-02 11:00:00']);
}

function overviewRange(): TimeRange
{
    return new TimeRange('24h', Carbon::now()->subHours(24)->toImmutable(), Carbon::now()->toImmutable());
}

it('narrows every number to the scope\'s agent', function () {
    overviewScopeDataset();

    $scoped = OverviewResource::of((new OverviewQuery)->read(overviewRange(), RunScope::agent('Alpha')));

    // The same read over a database that holds only Alpha's runs.
    Trace::query()->where('name', '!=', 'Alpha')->delete();
    $alone = OverviewResource::of((new OverviewQuery)->read(overviewRange(), RunScope::none()));

    expect($scoped)->toBe($alone)
        ->and($scoped['summary']['runs'])->toBe(['all' => 22, 'completed' => 20, 'failed' => 0, 'incomplete' => 1, 'running' => 1, 'awaiting_approval' => 0])
        ->and($scoped['summary']['duration']['p95_ms'])->toBe(190.0)
        ->and($scoped['previous']['duration']['p95_ms'])->toBe(1900.0)
        ->and($scoped['previous']['runs']['failed'])->toBe(20);
});

it('has the status counts of the list narrowed to the same agent', function () {
    overviewScopeDataset();

    $scoped = (new OverviewQuery)->read(overviewRange(), RunScope::agent('Beta'));
    $list = $this->getJson('/trail/api/traces?agent=Beta')->assertOk()->json('status_counts');

    expect($scoped->summary->figures->runs)->toBe($list)->and($list['all'])->toBe(21);
});

it('reads once for the figures and once for each period that has a percentile, scoped or not', function (RunScope $scope, int $reads) {
    overviewScopeDataset();

    $statements = [];
    DB::listen(function ($query) use (&$statements) {
        $statements[] = $query->sql;
    });

    (new OverviewQuery)->read(overviewRange(), $scope);

    expect($statements)->toHaveCount($reads);
})->with([
    'alpha: both periods have twenty measured runs' => [fn () => RunScope::agent('Alpha'), 3],
    'a name nobody has' => [fn () => RunScope::agent('Nobody'), 1],
]);

it('leaves the percentile out for a scope below the minimum even when the whole database is above it', function () {
    overviewScopeDataset();
    Rows::trace(['id' => 'gamma', 'name' => 'Gamma', 'started_at' => '2026-01-02 10:00:00', 'duration_ms' => 5]);

    $overview = (new OverviewQuery)->read(overviewRange(), RunScope::agent('Gamma'));

    expect($overview->summary->figures->measured)->toBe(1)
        ->and($overview->summary->p95Ms)->toBeNull()
        ->and($overview->previous)->toBeNull();
});
