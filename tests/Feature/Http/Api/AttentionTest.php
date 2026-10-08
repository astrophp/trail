<?php

use Astro\Trail\Enums\IssueKind;
use Astro\Trail\Enums\Status;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

beforeEach(function () {
    $this->app['env'] = 'local';
    Carbon::setTestNow('2026-01-02 12:00:00');
});

afterEach(function () {
    Carbon::setTestNow();
    config(['app.timezone' => 'UTC']);
    $this->app['env'] = 'testing';
});

/**
 * A finished run unless told otherwise.
 *
 * @param  array<string, mixed>  $attributes
 */
function attentionRun(string $started, array $attributes = []): Trace
{
    return Rows::trace([...['id' => 'run-'.str()->uuid(), 'status' => Status::Completed, 'started_at' => $started], ...$attributes]);
}

/**
 * @return array<string, mixed>
 */
function attentionAt(mixed $test, string $query = ''): array
{
    return $test->getJson('/trail/api/overview/attention'.($query === '' ? '' : '?'.$query))->assertOk()->json();
}

/**
 * @param  array<string, mixed>  $body
 * @return list<string>
 */
function attentionKinds(array $body): array
{
    return array_column($body['data'], 'kind');
}

/**
 * The runs of the default range (the clock is 2026-01-02 12:00:00, so the range is
 * 2026-01-01 12:00:00 to 2026-01-02 12:00:00), built so that a naive query miscounts every kind:
 *
 * - failed: twelve runs, three of them also child_failed, unpriced or recovered; one without an
 *   issue kind; issue kinds that tie on their counts;
 * - incomplete: one stored as such and one running run past the stale cutoff, the later of the two;
 * - child_failed: completed runs, while a failed, an incomplete and a running run carry the flag too;
 * - unpriced: any status, one that is failed and one that is awaiting approval;
 * - recovered: one completed and one that later failed;
 * - at the edges and beyond: runs with every flag one millisecond before the range, exactly at its
 *   end and after it.
 */
function attentionDataset(): void
{
    attentionRun('2026-01-02 11:00:00.250', ['id' => 'fa1', 'status' => Status::Failed, 'issue_kind' => IssueKind::RateLimited]);
    attentionRun('2026-01-02 10:00:00', ['id' => 'fa2', 'status' => Status::Failed, 'issue_kind' => IssueKind::RateLimited]);
    attentionRun('2026-01-02 09:00:00', ['id' => 'fa3', 'status' => Status::Failed, 'issue_kind' => IssueKind::RateLimited]);
    attentionRun('2026-01-02 08:00:00', ['id' => 'fa4', 'status' => Status::Failed, 'issue_kind' => IssueKind::Exception]);
    attentionRun('2026-01-02 07:00:00', ['id' => 'fa5', 'status' => Status::Failed, 'issue_kind' => IssueKind::Exception]);
    attentionRun('2026-01-02 06:00:00', ['id' => 'fa6', 'status' => Status::Failed, 'issue_kind' => IssueKind::ToolError]);
    // A failed run whose sub-agent failed is failed, not "completed although a sub-agent failed".
    attentionRun('2026-01-02 03:00:00', ['id' => 'fa7', 'status' => Status::Failed, 'issue_kind' => IssueKind::ToolError, 'child_failed' => true]);
    attentionRun('2026-01-02 05:00:00', ['id' => 'fa8', 'status' => Status::Failed, 'issue_kind' => IssueKind::InsufficientCredits]);
    attentionRun('2026-01-02 02:00:00', ['id' => 'fa9', 'status' => Status::Failed, 'issue_kind' => IssueKind::ProviderConnection, 'unpriced_span_count' => 1]);
    attentionRun('2026-01-02 01:30:00', ['id' => 'fa10', 'status' => Status::Failed, 'issue_kind' => IssueKind::Abandoned]);
    attentionRun('2026-01-02 04:00:00', ['id' => 'fa11', 'status' => Status::Failed]);
    // Recovered by a failover and failed later all the same.
    attentionRun('2026-01-02 01:00:00', ['id' => 'fa12', 'status' => Status::Failed, 'issue_kind' => IssueKind::ProviderConnection, 'recovered' => true]);

    attentionRun('2026-01-02 09:30:00', ['id' => 'in1', 'status' => Status::Incomplete, 'child_failed' => true]);
    attentionRun('2026-01-02 10:45:00', ['id' => 'in2', 'status' => Status::Running, 'created_at' => Carbon::now()->subHours(3)]);
    // Still running and not stale: in no list.
    attentionRun('2026-01-02 11:50:00', ['id' => 'ru1', 'status' => Status::Running]);
    attentionRun('2026-01-02 11:40:00', ['id' => 'ru2', 'status' => Status::Running, 'child_failed' => true]);

    attentionRun('2026-01-02 08:30:00', ['id' => 'aw1', 'status' => Status::AwaitingApproval, 'unpriced_span_count' => 3]);
    attentionRun('2026-01-02 11:15:00', ['id' => 'aw2', 'status' => Status::AwaitingApproval]);

    attentionRun('2026-01-02 10:20:00', ['id' => 'cf1', 'child_failed' => true]);
    attentionRun('2026-01-02 05:00:00', ['id' => 'cf2', 'child_failed' => true]);

    attentionRun('2026-01-02 10:10:00', ['id' => 'un1', 'unpriced_span_count' => 2, 'input_tokens' => 10]);
    // Nothing to price is not unpriced.
    attentionRun('2026-01-02 10:50:00', ['id' => 'un2', 'unpriced_span_count' => 0, 'cost' => null]);

    attentionRun('2026-01-02 09:45:00', ['id' => 'rc1', 'recovered' => true]);

    // Outside the range: every flag set, so that any of them would change a count or a latest start.
    $every = ['status' => Status::Failed, 'issue_kind' => IssueKind::RateLimited, 'child_failed' => true, 'unpriced_span_count' => 1, 'recovered' => true];
    attentionRun('2026-01-01 11:59:59.999', ['id' => 'out-before', ...$every]);
    attentionRun('2026-01-02 12:00:00', ['id' => 'out-at-end', ...$every]);
    attentionRun('2026-01-02 12:30:00', ['id' => 'out-after', ...$every]);
    attentionRun('2026-01-02 12:30:00', ['id' => 'out-after-completed', 'child_failed' => true]);
    attentionRun('2026-01-02 12:31:00', ['id' => 'out-after-awaiting', 'status' => Status::AwaitingApproval]);
    attentionRun('2026-01-02 12:32:00', ['id' => 'out-after-stale', 'status' => Status::Running, 'created_at' => Carbon::now()->subHours(3)]);
}

/**
 * What the list says about an item: the total of `GET /api/traces` with the item's filters and the
 * time range of the request that returned the item.
 *
 * @param  array<string, string>  $filters
 */
function attentionListed(mixed $test, array $filters, string $range = ''): int
{
    $query = http_build_query($filters).($range === '' ? '' : '&'.$range);
    $total = $test->getJson('/trail/api/traces?per_page=1&'.$query)->assertOk()->json('pagination.total');

    return is_int($total) ? $total : -1;
}

it('lists what needs a look, each kind once, most pressing first', function () {
    attentionDataset();

    $failedRows = [
        ['issue_kind' => 'rate_limited', 'count' => 3, 'latest_at' => '2026-01-02T11:00:00.250Z', 'filters' => ['status' => 'failed', 'issue_kind' => 'rate_limited']],
        ['issue_kind' => 'provider_connection', 'count' => 2, 'latest_at' => '2026-01-02T02:00:00.000Z', 'filters' => ['status' => 'failed', 'issue_kind' => 'provider_connection']],
        ['issue_kind' => 'tool_error', 'count' => 2, 'latest_at' => '2026-01-02T06:00:00.000Z', 'filters' => ['status' => 'failed', 'issue_kind' => 'tool_error']],
        ['issue_kind' => 'exception', 'count' => 2, 'latest_at' => '2026-01-02T08:00:00.000Z', 'filters' => ['status' => 'failed', 'issue_kind' => 'exception']],
        ['issue_kind' => 'insufficient_credits', 'count' => 1, 'latest_at' => '2026-01-02T05:00:00.000Z', 'filters' => ['status' => 'failed', 'issue_kind' => 'insufficient_credits']],
        ['issue_kind' => 'abandoned', 'count' => 1, 'latest_at' => '2026-01-02T01:30:00.000Z', 'filters' => ['status' => 'failed', 'issue_kind' => 'abandoned']],
    ];

    expect(attentionAt($this))->toBe([
        'data' => [
            ['kind' => 'failed', 'count' => 12, 'latest_at' => '2026-01-02T11:00:00.250Z', 'filters' => ['status' => 'failed'], 'breakdown' => $failedRows],
            ['kind' => 'incomplete', 'count' => 2, 'latest_at' => '2026-01-02T10:45:00.000Z', 'filters' => ['status' => 'incomplete'], 'breakdown' => []],
            ['kind' => 'awaiting_approval', 'count' => 2, 'latest_at' => '2026-01-02T11:15:00.000Z', 'filters' => ['status' => 'awaiting_approval'], 'breakdown' => []],
            ['kind' => 'child_failed', 'count' => 2, 'latest_at' => '2026-01-02T10:20:00.000Z', 'filters' => ['status' => 'completed', 'child_failed' => '1'], 'breakdown' => []],
            ['kind' => 'unpriced', 'count' => 3, 'latest_at' => '2026-01-02T10:10:00.000Z', 'filters' => ['unpriced' => '1'], 'breakdown' => []],
            ['kind' => 'recovered', 'count' => 2, 'latest_at' => '2026-01-02T09:45:00.000Z', 'filters' => ['recovered' => '1'], 'breakdown' => []],
        ],
        'range' => ['preset' => '24h', 'from' => '2026-01-01T12:00:00.000Z', 'to' => '2026-01-02T12:00:00.000Z'],
    ]);
});

describe('against the list of runs', function () {
    it('has, for every kind and every breakdown row, the total the list gives for its filters', function (string $query) {
        attentionDataset();

        $body = attentionAt($this, $query);
        $checked = 0;

        foreach ($body['data'] as $item) {
            expect(attentionListed($this, $item['filters'], $query))->toBe($item['count'], "the {$item['kind']} item");
            $checked++;

            foreach ($item['breakdown'] as $row) {
                expect(attentionListed($this, $row['filters'], $query))->toBe($row['count'], "the {$row['issue_kind']} row");
                $checked++;
            }
        }

        // Six kinds and six issue kinds: a list that lost an item would pass the loop above.
        expect($checked)->toBe(12);
    })->with(['the default range' => '', '24h' => 'range=24h', 'explicit' => 'from=2026-01-01T12:00:00Z&to=2026-01-02T12:00:00Z']);

    it('has the stale running run in incomplete, with the issue kind abandoned', function () {
        attentionDataset();

        $incomplete = attentionAt($this)['data'][1];

        expect($incomplete['kind'])->toBe('incomplete')->and($incomplete['count'])->toBe(2)
            // The list shows the stale run as incomplete and abandoned, so that is what is counted.
            ->and($this->getJson('/trail/api/traces?status=incomplete&issue_kind=abandoned')->json('data.0.id'))->toBe('in2')
            ->and($this->getJson('/trail/api/traces?status=incomplete&issue_kind=abandoned')->json('pagination.total'))->toBe(1)
            ->and($this->getJson('/trail/api/traces?status=running')->json('pagination.total'))->toBe(2);
    });

    it('leaves the stale running run out of the failed item and its abandoned row', function () {
        attentionDataset();

        $failed = attentionAt($this)['data'][0];
        $abandoned = collect($failed['breakdown'])->firstWhere('issue_kind', 'abandoned');

        // Only the failed run stored as abandoned: the list would add the stale one without the status filter.
        expect($abandoned['count'])->toBe(1)
            ->and($this->getJson('/trail/api/traces?issue_kind=abandoned')->json('pagination.total'))->toBe(2)
            ->and(attentionListed($this, $abandoned['filters']))->toBe(1);
    });

    it('keeps the kinds apart where a run is of several', function () {
        attentionDataset();

        $items = collect(attentionAt($this)['data'])->keyBy('kind');

        // fa7 is failed and child_failed; fa9 is failed and unpriced; fa12 is failed and recovered.
        expect($items['child_failed']['count'])->toBe(2)
            ->and($this->getJson('/trail/api/traces?child_failed=1')->json('pagination.total'))->toBe(5)
            ->and($items['unpriced']['count'])->toBe(3)
            ->and($items['recovered']['count'])->toBe(2)
            ->and($this->getJson('/trail/api/traces?status=failed&unpriced=1')->json('pagination.total'))->toBe(1)
            ->and($this->getJson('/trail/api/traces?status=failed&recovered=1')->json('pagination.total'))->toBe(1);
    });
});

describe('a kind', function () {
    // The kind, a run that is of it, and a run that only looks like it.
    $kinds = [
        'failed' => ['failed', ['status' => Status::Failed], ['status' => Status::Completed], []],
        'incomplete' => ['incomplete', ['status' => Status::Incomplete], ['status' => Status::Running], []],
        'incomplete, a stale running run' => ['incomplete', ['status' => Status::Running, 'created_at' => '2026-01-02 09:00:00'], ['status' => Status::Running, 'created_at' => '2026-01-02 11:30:00'], []],
        'awaiting_approval' => ['awaiting_approval', ['status' => Status::AwaitingApproval], ['status' => Status::Completed], []],
        'child_failed' => ['child_failed', ['child_failed' => true], ['child_failed' => false], []],
        'child_failed, not a failed run' => ['child_failed', ['child_failed' => true], ['status' => Status::Failed, 'child_failed' => true], ['failed']],
        'child_failed, not a running run' => ['child_failed', ['child_failed' => true], ['status' => Status::Running, 'child_failed' => true], []],
        'unpriced' => ['unpriced', ['unpriced_span_count' => 1], ['unpriced_span_count' => 0, 'cost' => null], []],
        'recovered' => ['recovered', ['recovered' => true], ['recovered' => false], []],
    ];

    it('is alone when only its runs are there', function (string $kind, array $attributes) {
        attentionRun('2026-01-02 10:00:00', $attributes);

        $body = attentionAt($this);

        expect(attentionKinds($body))->toBe([$kind])
            ->and($body['data'][0]['count'])->toBe(1)
            ->and($body['data'][0]['latest_at'])->toBe('2026-01-02T10:00:00.000Z')
            ->and(attentionListed($this, $body['data'][0]['filters']))->toBe(1);
    })->with($kinds);

    it('is absent for a run that only looks like it, which is in no kind or in another', function (string $kind, array $attributes, array $other, array $elsewhere) {
        attentionRun('2026-01-02 10:00:00', $other);

        expect(attentionKinds(attentionAt($this)))->toBe($elsewhere);
    })->with($kinds);
});

it('has nothing in a healthy range, which is an answer and not an error', function () {
    attentionRun('2026-01-02 10:00:00');
    attentionRun('2026-01-02 11:00:00', ['status' => Status::Running]);
    // Everything wrong, but not in the range.
    attentionRun('2026-01-01 11:59:59.999', ['status' => Status::Failed, 'child_failed' => true, 'unpriced_span_count' => 1, 'recovered' => true]);
    attentionRun('2026-01-02 12:00:00', ['status' => Status::Failed]);

    expect(attentionAt($this))->toBe([
        'data' => [],
        'range' => ['preset' => '24h', 'from' => '2026-01-01T12:00:00.000Z', 'to' => '2026-01-02T12:00:00.000Z'],
    ]);
});

it('has nothing in an empty database', function () {
    expect(attentionAt($this)['data'])->toBe([]);
});

it('lists the kinds in a fixed order whatever the order the runs came in or started', function () {
    // The most pressing kind started first, the least pressing last and the other way round.
    attentionRun('2026-01-02 11:00:00', ['recovered' => true]);
    attentionRun('2026-01-02 10:00:00', ['unpriced_span_count' => 1]);
    attentionRun('2026-01-02 09:00:00', ['child_failed' => true]);
    attentionRun('2026-01-02 08:00:00', ['status' => Status::AwaitingApproval]);
    attentionRun('2026-01-02 07:00:00', ['status' => Status::Incomplete]);
    attentionRun('2026-01-02 06:00:00', ['status' => Status::Failed]);

    expect(attentionKinds(attentionAt($this)))->toBe(['failed', 'incomplete', 'awaiting_approval', 'child_failed', 'unpriced', 'recovered']);
});

describe('the latest start', function () {
    it('is the latest run of the range, and not a later one outside it', function () {
        attentionRun('2026-01-02 09:00:00', ['status' => Status::Failed]);
        attentionRun('2026-01-02 11:59:59.999', ['status' => Status::Failed]);
        attentionRun('2026-01-02 11:00:00', ['status' => Status::Failed]);
        attentionRun('2026-01-02 12:00:00', ['status' => Status::Failed]);
        attentionRun('2026-01-03 08:00:00', ['status' => Status::Failed]);

        $item = attentionAt($this)['data'][0];

        expect($item['count'])->toBe(3)->and($item['latest_at'])->toBe('2026-01-02T11:59:59.999Z');
    });

    it('is the latest run of its own kind and of its own row', function () {
        attentionRun('2026-01-02 11:00:00', ['status' => Status::Failed, 'issue_kind' => IssueKind::Exception]);
        attentionRun('2026-01-02 08:00:00', ['status' => Status::Failed, 'issue_kind' => IssueKind::RateLimited]);
        attentionRun('2026-01-02 09:00:00', ['status' => Status::Failed, 'issue_kind' => IssueKind::RateLimited]);
        attentionRun('2026-01-02 11:30:00', ['child_failed' => true]);
        attentionRun('2026-01-02 11:45:00');

        $items = collect(attentionAt($this)['data'])->keyBy('kind');
        $rows = collect($items['failed']['breakdown'])->keyBy('issue_kind');

        expect($items['failed']['latest_at'])->toBe('2026-01-02T11:00:00.000Z')
            ->and($rows['rate_limited']['latest_at'])->toBe('2026-01-02T09:00:00.000Z')
            ->and($rows['exception']['latest_at'])->toBe('2026-01-02T11:00:00.000Z')
            ->and($items['child_failed']['latest_at'])->toBe('2026-01-02T11:30:00.000Z');
    });

    it('is a stale running run\'s start when it is the latest incomplete one', function () {
        attentionRun('2026-01-02 08:00:00', ['status' => Status::Incomplete]);
        attentionRun('2026-01-02 10:30:00', ['status' => Status::Running, 'created_at' => Carbon::now()->subHours(2)]);
        attentionRun('2026-01-02 11:45:00', ['status' => Status::Running]);

        expect(attentionAt($this)['data'][0])->toMatchArray(['kind' => 'incomplete', 'count' => 2, 'latest_at' => '2026-01-02T10:30:00.000Z']);
    });

    it('is written in UTC from a start stored in the application\'s timezone', function () {
        config(['app.timezone' => 'America/New_York']);
        // 06:00 in New York in January is 11:00 UTC.
        attentionRun('2026-01-02 06:00:00', ['status' => Status::Failed]);

        $body = attentionAt($this);

        expect($body['data'][0]['latest_at'])->toBe('2026-01-02T11:00:00.000Z')
            ->and($body['data'][0]['count'])->toBe(1);
    });
});

describe('the breakdown of the failed runs', function () {
    it('is ordered by count, then by the order of the issue kinds, whatever the order of the runs', function () {
        $made = 0;

        foreach ([['exception', 2], ['tool_error', 2], ['insufficient_credits', 1], ['provider_overloaded', 1], ['rate_limited', 4]] as [$kind, $count]) {
            foreach (range(1, $count) as $i) {
                attentionRun('2026-01-02 10:'.str_pad((string) $made++, 2, '0', STR_PAD_LEFT).':00', ['status' => Status::Failed, 'issue_kind' => $kind]);
            }
        }

        $failed = attentionAt($this)['data'][0];

        expect(array_column($failed['breakdown'], 'issue_kind'))->toBe(['rate_limited', 'tool_error', 'exception', 'provider_overloaded', 'insufficient_credits'])
            ->and(array_column($failed['breakdown'], 'count'))->toBe([4, 2, 2, 1, 1])
            ->and($failed['count'])->toBe(10);
    });

    it('has a row only for an issue kind that a failed run has', function () {
        attentionRun('2026-01-02 10:00:00', ['status' => Status::Failed, 'issue_kind' => IssueKind::Exception]);
        // Not failed runs: their issue kind is theirs, not a failure's.
        attentionRun('2026-01-02 10:01:00', ['status' => Status::Incomplete, 'issue_kind' => IssueKind::ToolError]);
        attentionRun('2026-01-02 10:02:00', ['status' => Status::Completed, 'issue_kind' => IssueKind::RateLimited]);
        attentionRun('2026-01-02 10:03:00', ['status' => Status::Running, 'created_at' => Carbon::now()->subHours(2)]);

        $failed = attentionAt($this)['data'][0];

        expect(array_column($failed['breakdown'], 'issue_kind'))->toBe(['exception']);
    });

    it('leaves out a failed run without an issue kind, so its rows can add up to less than the count', function () {
        attentionRun('2026-01-02 10:00:00', ['status' => Status::Failed, 'issue_kind' => IssueKind::Exception]);
        attentionRun('2026-01-02 10:01:00', ['status' => Status::Failed]);
        attentionRun('2026-01-02 10:02:00', ['status' => Status::Failed]);

        $failed = attentionAt($this)['data'][0];

        expect($failed['count'])->toBe(3)
            ->and(array_sum(array_column($failed['breakdown'], 'count')))->toBe(1)
            ->and(attentionListed($this, $failed['filters']))->toBe(3);
    });

    it('is empty for a failed run that has no issue kind at all', function () {
        attentionRun('2026-01-02 10:01:00', ['status' => Status::Failed]);

        expect(attentionAt($this)['data'][0])->toMatchArray(['kind' => 'failed', 'count' => 1, 'breakdown' => []]);
    });

    it('belongs to the failed item alone', function () {
        attentionDataset();

        foreach (attentionAt($this)['data'] as $item) {
            expect($item['breakdown'] === [])->toBe($item['kind'] !== 'failed');
        }
    });
});

describe('the edges of the range', function () {
    it('counts a run that starts at the beginning and not one that starts at the end', function () {
        attentionRun('2026-01-01 12:00:00', ['id' => 'at-from', 'status' => Status::Failed, 'issue_kind' => IssueKind::Exception]);
        attentionRun('2026-01-01 11:59:59.999', ['id' => 'before-from', 'status' => Status::Failed, 'issue_kind' => IssueKind::Exception]);
        attentionRun('2026-01-02 11:59:59.999', ['id' => 'before-to', 'status' => Status::AwaitingApproval]);
        attentionRun('2026-01-02 12:00:00', ['id' => 'at-to', 'status' => Status::AwaitingApproval]);

        foreach (['', 'from=2026-01-01T12:00:00Z&to=2026-01-02T12:00:00Z'] as $query) {
            $body = attentionAt($this, $query);

            expect(attentionKinds($body))->toBe(['failed', 'awaiting_approval'])
                ->and($body['data'][0]['count'])->toBe(1)
                ->and($body['data'][0]['latest_at'])->toBe('2026-01-01T12:00:00.000Z')
                ->and($body['data'][0]['breakdown'][0]['count'])->toBe(1)
                ->and($body['data'][1]['count'])->toBe(1)
                ->and($body['data'][1]['latest_at'])->toBe('2026-01-02T11:59:59.999Z')
                ->and(attentionListed($this, $body['data'][0]['filters'], $query))->toBe(1)
                ->and(attentionListed($this, $body['data'][1]['filters'], $query))->toBe(1);
        }
    });

    it('reads an explicit range, which repeats as it was sent', function () {
        attentionRun('2025-12-31 10:00:00', ['status' => Status::Failed]);
        attentionRun('2026-01-02 10:00:00', ['status' => Status::Failed]);

        $body = attentionAt($this, 'from=2025-12-31T00:00:00Z&to=2026-01-01T00:00:00Z');

        expect($body['range'])->toBe(['preset' => null, 'from' => '2025-12-31T00:00:00.000Z', 'to' => '2026-01-01T00:00:00.000Z'])
            ->and($body['data'][0]['count'])->toBe(1)
            ->and($body['data'][0]['latest_at'])->toBe('2025-12-31T10:00:00.000Z');
    });

    it('reads a preset back from now', function (string $range, string $started, int $count) {
        attentionRun($started, ['status' => Status::Failed]);

        expect(array_sum(array_column(attentionAt($this, 'range='.$range)['data'], 'count')))->toBe($count);
    })->with([
        'inside 1h' => ['1h', '2026-01-02 11:30:00', 1],
        'outside 1h' => ['1h', '2026-01-02 10:59:59.999', 0],
        'inside 7d' => ['7d', '2025-12-26 12:00:00', 1],
        'outside 7d' => ['7d', '2025-12-26 11:59:59.999', 0],
    ]);
});

it('ignores every parameter but the time range', function () {
    attentionRun('2026-01-02 10:00:00', ['name' => 'Alpha', 'status' => Status::Failed]);
    attentionRun('2026-01-02 10:01:00', ['name' => 'Beta', 'recovered' => true]);

    expect(attentionAt($this, 'agent=Alpha&status=completed&issue_kind=exception&page=9&per_page=1&recovered=1&sort=agent')['data'])->toBe(attentionAt($this)['data'])
        ->and(attentionKinds(attentionAt($this, 'agent=Alpha')))->toBe(['failed', 'recovered']);
});

describe('the read', function () {
    it('is one query over the runs, whatever the range and what it finds', function (string $query, bool $dataset) {
        if ($dataset) {
            attentionDataset();
        }

        $statements = [];
        DB::listen(function ($executed) use (&$statements) {
            $statements[] = $executed->sql;
        });

        attentionAt($this, $query);

        $runs = array_filter($statements, fn (string $sql) => str_contains($sql, 'trail_traces'));

        expect($runs)->toHaveCount(1)
            // The runs are the only table the read touches.
            ->and(array_filter($statements, fn (string $sql) => str_contains($sql, 'trail_') && ! str_contains($sql, 'trail_traces')))->toBe([]);
    })->with([
        'busy, 24h' => ['', true],
        'busy, 7d' => ['range=7d', true],
        'busy, explicit' => ['from=2025-10-02T00:00:00Z&to=2026-01-02T00:00:00Z', true],
        'empty' => ['', false],
    ]);
});

describe('access', function () {
    it('answers a denied request with a JSON 403', function () {
        $this->app['env'] = 'production';

        $this->get('/trail/api/overview/attention', ['Accept' => 'text/html'])->assertForbidden()->assertJsonStructure(['message']);

        Trail::auth(fn () => true);
        $this->get('/trail/api/overview/attention', ['Accept' => 'text/html'])->assertOk();

        Trail::auth(fn () => false);
        $this->get('/trail/api/overview/attention', ['Accept' => 'text/html'])->assertForbidden();
    });

    it('answers a JSON 404 when the dashboard is switched off', function () {
        config(['trail.dashboard.enabled' => false]);

        $this->get('/trail/api/overview/attention', ['Accept' => 'text/html'])->assertNotFound()->assertJsonStructure(['message']);
    });
});

describe('a bad time range', function () {
    it('is the 422 the list gives', function (string $query) {
        $attention = $this->getJson('/trail/api/overview/attention?'.$query);
        $list = $this->getJson('/trail/api/traces?'.$query);

        $attention->assertUnprocessable();
        expect($attention->json())->toBe($list->json());
    })->with([
        'unknown preset' => 'range=30d',
        'preset with a bound' => 'range=7d&from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z',
        'one bound' => 'from=2026-01-01T00:00:00Z',
        'inverted' => 'from=2026-01-02T00:00:00Z&to=2026-01-01T00:00:00Z',
        'not a date' => 'from=yesterday&to=today',
    ]);

    it('is a JSON 422 even when HTML is asked for', function () {
        $this->get('/trail/api/overview/attention?range=bad', ['Accept' => 'text/html'])->assertUnprocessable()->assertJsonValidationErrors(['range']);
    });
});

it('does not take the overview\'s place, nor does the overview take its', function () {
    attentionRun('2026-01-02 10:00:00', ['status' => Status::Failed]);

    $this->getJson('/trail/api/overview')->assertOk()->assertJsonPath('data.summary.runs.failed', 1)->assertJsonMissingPath('data.0');
    $this->getJson('/trail/api/overview/attention')->assertOk()->assertJsonPath('data.0.kind', 'failed')->assertJsonMissingPath('data.summary');
    $this->getJson('/trail/api/overview/attention/more')->assertNotFound();
});
