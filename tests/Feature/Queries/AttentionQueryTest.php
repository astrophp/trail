<?php

use Astro\Trail\Enums\IssueKind;
use Astro\Trail\Enums\Status;
use Astro\Trail\Http\Resources\AttentionResource;
use Astro\Trail\Queries\AttentionQuery;
use Astro\Trail\Queries\RunScope;
use Astro\Trail\Queries\TimeRange;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Illuminate\Support\Carbon;

beforeEach(function () {
    $this->app['env'] = 'local';
    Carbon::setTestNow('2026-01-02 12:00:00');
});

afterEach(function () {
    Carbon::setTestNow();
    $this->app['env'] = 'testing';
});

/**
 * Two agents with runs of every kind, the second agent's more numerous in each, so that a count
 * that ignores the scope is a different number.
 */
function attentionScopeDataset(): void
{
    $make = function (string $agent, int $times, string $started, array $attributes) {
        foreach (range(1, $times) as $i) {
            Rows::trace([...['id' => "{$agent}-{$started}-{$i}-".str()->uuid(), 'name' => $agent, 'status' => Status::Completed, 'started_at' => $started], ...$attributes]);
        }
    };

    foreach (['Alpha' => 1, 'Beta' => 3] as $agent => $times) {
        $make($agent, $times, $agent === 'Alpha' ? '2026-01-02 09:00:00' : '2026-01-02 11:00:00', ['status' => Status::Failed, 'issue_kind' => IssueKind::Exception]);
        $make($agent, $times + 1, $agent === 'Alpha' ? '2026-01-02 08:00:00' : '2026-01-02 10:00:00', ['status' => Status::Failed, 'issue_kind' => IssueKind::RateLimited]);
        $make($agent, $times, $agent === 'Alpha' ? '2026-01-02 07:00:00' : '2026-01-02 10:30:00', ['status' => Status::Running, 'created_at' => Carbon::now()->subHours(3)]);
        $make($agent, $times, $agent === 'Alpha' ? '2026-01-02 06:00:00' : '2026-01-02 09:30:00', ['status' => Status::AwaitingApproval]);
        $make($agent, $times, $agent === 'Alpha' ? '2026-01-02 05:00:00' : '2026-01-02 09:00:00', ['child_failed' => true]);
        $make($agent, $times, $agent === 'Alpha' ? '2026-01-02 04:00:00' : '2026-01-02 08:30:00', ['unpriced_span_count' => 1]);
        $make($agent, $times, $agent === 'Alpha' ? '2026-01-02 03:00:00' : '2026-01-02 08:00:00', ['recovered' => true]);
    }
}

function attentionRange(): TimeRange
{
    return new TimeRange('24h', Carbon::now()->subHours(24)->toImmutable(), Carbon::now()->toImmutable());
}

it('narrows every count and every latest start to the scope\'s agent', function () {
    attentionScopeDataset();

    $all = AttentionResource::of((new AttentionQuery)->read(attentionRange(), RunScope::none()));
    $scoped = AttentionResource::of((new AttentionQuery)->read(attentionRange(), RunScope::agent('Alpha')));

    // The same read over a database that holds only Alpha's runs.
    Trace::query()->where('name', '!=', 'Alpha')->delete();
    $alone = AttentionResource::of((new AttentionQuery)->read(attentionRange(), RunScope::none()));

    expect($scoped)->toBe($alone)
        ->and($all)->not->toBe($scoped)
        ->and(array_column($scoped, 'count'))->toBe([3, 1, 1, 1, 1, 1])
        ->and(array_column($all, 'count'))->toBe([10, 4, 4, 4, 4, 4])
        ->and(array_column($scoped[0]['breakdown'], 'count'))->toBe([2, 1])
        ->and(array_column($all[0]['breakdown'], 'count'))->toBe([6, 4]);
});

it('has, for a scope, the totals the list gives for the item\'s filters with the agent added', function () {
    attentionScopeDataset();

    $items = AttentionResource::of((new AttentionQuery)->read(attentionRange(), RunScope::agent('Alpha')));
    $checked = 0;

    foreach ($items as $item) {
        foreach ([$item, ...$item['breakdown']] as $counted) {
            $total = $this->getJson('/trail/api/traces?per_page=1&'.http_build_query([...$counted['filters'], 'agent' => 'Alpha']))->json('pagination.total');

            expect($total)->toBe($counted['count']);
            $checked++;
        }
    }

    // Six kinds and the two issue kinds of the failed runs.
    expect($checked)->toBe(8);
});

it('compares the agent\'s name as the list does', function () {
    Rows::trace(['id' => 'lower', 'name' => 'alpha', 'status' => Status::Failed, 'started_at' => '2026-01-02 10:00:00']);
    Rows::trace(['id' => 'exact', 'name' => 'Alpha', 'status' => Status::Failed, 'started_at' => '2026-01-02 10:01:00']);

    $counted = (new AttentionQuery)->read(attentionRange(), RunScope::agent('Alpha'));
    $listed = $this->getJson('/trail/api/traces?status=failed&agent=Alpha')->json('pagination.total');

    expect($counted[0]->count)->toBe($listed);
});

it('reads nothing when the scope holds no run', function () {
    attentionScopeDataset();

    expect((new AttentionQuery)->read(attentionRange(), RunScope::agent('Nobody')))->toBe([]);
});

it('keeps an item whose count is above zero when its latest start cannot be read', function () {
    $row = (object) [
        'kind_failed' => '3', 'kind_failed_latest' => 'not a date',
        'issue_rate_limited' => 2, 'issue_rate_limited_latest' => null,
        'kind_incomplete' => '0', 'kind_incomplete_latest' => null,
        'kind_recovered' => 1, 'kind_recovered_latest' => '2026-01-02 10:00:00.000',
    ];

    $resource = AttentionResource::of(AttentionQuery::items($row));

    expect(array_column($resource, 'kind'))->toBe(['failed', 'recovered'])
        ->and(array_column($resource, 'count'))->toBe([3, 1])
        ->and(array_column($resource, 'latest_at'))->toBe([null, '2026-01-02T10:00:00.000Z'])
        ->and($resource[0]['breakdown'])->toBe([['issue_kind' => 'rate_limited', 'count' => 2, 'latest_at' => null, 'filters' => ['status' => 'failed', 'issue_kind' => 'rate_limited']]]);
});

it('has no item for a row without counts', function () {
    expect(AttentionQuery::items(new stdClass))->toBe([]);
});
