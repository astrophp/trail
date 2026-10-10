<?php

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
function overviewRun(string $started, array $attributes = []): Trace
{
    return Rows::trace([...['id' => 'run-'.str()->uuid(), 'status' => Status::Completed, 'started_at' => $started], ...$attributes]);
}

/**
 * @return array<string, mixed>
 */
function overviewAt(mixed $test, string $query = ''): array
{
    return $test->getJson('/trail/api/overview'.($query === '' ? '' : '?'.$query))->assertOk()->json();
}

/**
 * @return array{all: int, completed: int, failed: int, incomplete: int, running: int, awaiting_approval: int}
 */
function overviewCounts(int $completed = 0, int $failed = 0, int $incomplete = 0, int $running = 0, int $awaiting = 0): array
{
    return ['all' => $completed + $failed + $incomplete + $running + $awaiting, 'completed' => $completed, 'failed' => $failed, 'incomplete' => $incomplete, 'running' => $running, 'awaiting_approval' => $awaiting];
}

/**
 * Runs of every status, with and without a duration, tokens and cost, inside the default range
 * (the clock is 2026-01-02 12:00:00, so the range starts 2026-01-01 12:00:00).
 */
function overviewMixedDataset(): void
{
    overviewRun('2026-01-02 10:00:00', ['id' => 'c1', 'duration_ms' => 1000, 'input_tokens' => 100, 'output_tokens' => 50, 'cost' => 0.5]);
    overviewRun('2026-01-02 10:30:00', ['id' => 'c2', 'duration_ms' => 3000, 'input_tokens' => 200, 'cost' => 0.25, 'unpriced_span_count' => 1]);
    overviewRun('2026-01-02 11:00:00', ['id' => 'c3']);
    overviewRun('2026-01-02 09:00:00', ['id' => 'f1', 'status' => Status::Failed, 'duration_ms' => 500]);
    overviewRun('2026-01-02 08:00:00', ['id' => 'i1', 'status' => Status::Incomplete]);
    overviewRun('2026-01-02 11:50:00', ['id' => 'r1', 'status' => Status::Running]);
    overviewRun('2026-01-02 07:00:00', ['id' => 'a1', 'status' => Status::AwaitingApproval]);
    // Running for longer than stale_after: shown as incomplete.
    overviewRun('2026-01-02 06:00:00', ['id' => 'stale', 'status' => Status::Running, 'created_at' => Carbon::now()->subHours(2)]);
}

/**
 * @return list<string> the statements that read runs
 */
function overviewStatements(callable $request): array
{
    $statements = [];
    DB::listen(function ($query) use (&$statements) {
        if (str_contains($query->sql, 'trail_traces')) {
            $statements[] = $query->sql;
        }
    });

    $request();

    return $statements;
}

it('sums up a range of runs of every kind', function () {
    overviewMixedDataset();

    $body = overviewAt($this);

    expect($body['range'])->toBe(['preset' => '24h', 'from' => '2026-01-01T12:00:00.000Z', 'to' => '2026-01-02T12:00:00.000Z'])
        ->and($body['previous_range'])->toBe(['from' => '2025-12-31T12:00:00.000Z', 'to' => '2026-01-01T12:00:00.000Z'])
        ->and($body['data']['previous'])->toBeNull()
        ->and($body['data']['summary'])->toBe([
            'runs' => overviewCounts(completed: 3, failed: 1, incomplete: 2, running: 1, awaiting: 1),
            'error_rate' => ['rate' => 0.1666666667, 'failed' => 1, 'finished' => 6],
            'duration' => ['average_ms' => 1500, 'p95_ms' => null, 'measured' => 3, 'not_measured' => 5, 'p95_minimum' => 20],
            'usage' => [
                'state' => 'pending', 'input_tokens' => 300, 'output_tokens' => 50, 'cache_read_tokens' => null,
                'cache_write_tokens' => null, 'reasoning_tokens' => null, 'total_tokens' => 350,
            ],
            'usage_coverage' => ['reported' => 2, 'not_reported' => 6],
            'cost' => ['state' => 'pending', 'amount' => 0.75],
            'cost_coverage' => ['unpriced_runs' => 1, 'runs_without_amount' => 6],
        ]);
});

it('answers an empty range with zero counts and nothing else invented', function () {
    $body = overviewAt($this);

    expect($body['data']['summary'])->toBe([
        'runs' => overviewCounts(),
        'error_rate' => ['rate' => null, 'failed' => 0, 'finished' => 0],
        'duration' => ['average_ms' => null, 'p95_ms' => null, 'measured' => 0, 'not_measured' => 0, 'p95_minimum' => 20],
        'usage' => [
            'state' => 'not_reported', 'input_tokens' => null, 'output_tokens' => null, 'cache_read_tokens' => null,
            'cache_write_tokens' => null, 'reasoning_tokens' => null, 'total_tokens' => null,
        ],
        'usage_coverage' => ['reported' => 0, 'not_reported' => 0],
        'cost' => ['state' => 'not_captured', 'amount' => null],
        'cost_coverage' => ['unpriced_runs' => 0, 'runs_without_amount' => 0],
    ])->and($body['data']['previous'])->toBeNull()
        ->and($body['data']['series']['buckets'])->toHaveCount(24);

    foreach ($body['data']['series']['buckets'] as $bucket) {
        expect($bucket['runs'])->toBe(overviewCounts())
            ->and($bucket['duration'])->toBe(['average_ms' => null, 'measured' => 0])
            ->and($bucket['cost'])->toBe(['state' => 'not_captured', 'amount' => null])
            ->and($bucket['unpriced_runs'])->toBe(0);
    }
});

it('shows a range of running runs as pending, with no duration and no error rate', function () {
    overviewRun('2026-01-02 11:00:00', ['status' => Status::Running, 'input_tokens' => 10, 'cost' => 0.01]);
    overviewRun('2026-01-02 11:30:00', ['status' => Status::Running]);

    $summary = overviewAt($this)['data']['summary'];

    expect($summary['runs'])->toBe(overviewCounts(running: 2))
        ->and($summary['error_rate'])->toBe(['rate' => null, 'failed' => 0, 'finished' => 0])
        ->and($summary['duration'])->toBe(['average_ms' => null, 'p95_ms' => null, 'measured' => 0, 'not_measured' => 2, 'p95_minimum' => 20])
        ->and($summary['usage']['state'])->toBe('pending')
        ->and($summary['usage']['input_tokens'])->toBe(10)
        ->and($summary['cost'])->toBe(['state' => 'pending', 'amount' => 0.01]);
});

describe('the stale rule', function () {
    it('counts a stale running run as incomplete in the summary and in its bucket, and makes nothing pending', function () {
        overviewRun('2026-01-02 10:15:00', ['id' => 'stale', 'status' => Status::Running, 'created_at' => Carbon::now()->subHours(2), 'cost' => 0.5, 'input_tokens' => 7]);

        $data = overviewAt($this)['data'];
        $bucket = $data['series']['buckets'][22];

        expect($data['summary']['runs'])->toBe(overviewCounts(incomplete: 1))
            ->and($data['summary']['usage']['state'])->toBe('reported')
            ->and($data['summary']['cost'])->toBe(['state' => 'estimated', 'amount' => 0.5])
            ->and($data['summary']['error_rate'])->toBe(['rate' => 0, 'failed' => 0, 'finished' => 1])
            ->and($bucket['from'])->toBe('2026-01-02T10:00:00.000Z')
            ->and($bucket['runs'])->toBe(overviewCounts(incomplete: 1))
            ->and($bucket['cost'])->toBe(['state' => 'estimated', 'amount' => 0.5]);
    });

    it('keeps a running run that is not stale running, and pending', function () {
        overviewRun('2026-01-02 10:15:00', ['status' => Status::Running, 'created_at' => Carbon::now()->subMinutes(59), 'cost' => 0.5]);

        $data = overviewAt($this)['data'];

        expect($data['summary']['runs'])->toBe(overviewCounts(running: 1))
            ->and($data['summary']['cost']['state'])->toBe('pending')
            ->and($data['series']['buckets'][22]['runs'])->toBe(overviewCounts(running: 1))
            ->and($data['series']['buckets'][22]['cost']['state'])->toBe('pending');
    });
});

describe('the previous period', function () {
    it('sums up the window of equal length before the range', function () {
        overviewRun('2025-12-31 18:00:00', ['status' => Status::Failed, 'duration_ms' => 400, 'cost' => 0.2]);
        overviewRun('2026-01-01 11:00:00', ['duration_ms' => 600, 'cost' => 0.3]);
        overviewRun('2026-01-02 11:00:00');

        $data = overviewAt($this)['data'];

        expect($data['previous']['runs'])->toBe(overviewCounts(completed: 1, failed: 1))
            ->and($data['previous']['error_rate'])->toBe(['rate' => 0.5, 'failed' => 1, 'finished' => 2])
            ->and($data['previous']['duration']['average_ms'])->toBe(500)
            ->and($data['previous']['cost'])->toBe(['state' => 'estimated', 'amount' => 0.5])
            ->and($data['summary']['runs'])->toBe(overviewCounts(completed: 1));
    });

    it('is null when the previous window holds no runs, and its bounds are still sent', function () {
        overviewRun('2026-01-02 11:00:00');
        // Just before the window.
        overviewRun('2025-12-31 11:59:59.999');

        $body = overviewAt($this);

        expect($body['data']['previous'])->toBeNull()
            ->and($body['previous_range'])->toBe(['from' => '2025-12-31T12:00:00.000Z', 'to' => '2026-01-01T12:00:00.000Z']);
    });

    it('counts a stale running run of the previous window as incomplete and makes nothing there pending', function () {
        overviewRun('2025-12-31 18:00:00', ['status' => Status::Running, 'created_at' => Carbon::now()->subHours(3), 'cost' => 0.2, 'input_tokens' => 4]);
        overviewRun('2025-12-31 19:00:00', ['cost' => 0.1]);

        $previous = overviewAt($this)['data']['previous'];

        expect($previous['runs'])->toBe(overviewCounts(completed: 1, incomplete: 1))
            ->and($previous['cost']['state'])->toBe('estimated')
            ->and($previous['usage']['state'])->toBe('reported');
    });

    it('puts a run at the previous window\'s first instant in it, and one a millisecond earlier in neither period', function () {
        overviewRun('2025-12-31 12:00:00', ['id' => 'first-instant']);
        overviewRun('2025-12-31 11:59:59.999', ['id' => 'a-millisecond-before']);

        $data = overviewAt($this)['data'];

        expect($data['previous']['runs'])->toBe(overviewCounts(completed: 1))
            ->and($data['summary']['runs'])->toBe(overviewCounts());
    });

    it('puts a run that starts exactly where the range starts in the range', function () {
        overviewRun('2026-01-01 12:00:00', ['id' => 'on-the-edge']);
        overviewRun('2026-01-01 11:59:59.999', ['id' => 'just-before']);

        $data = overviewAt($this)['data'];

        expect($data['summary']['runs']['all'])->toBe(1)
            ->and($data['series']['buckets'][0]['runs']['all'])->toBe(1)
            ->and($data['previous']['runs']['all'])->toBe(1);
    });

    it('measures an explicit range against the window of equal length that ends where it starts', function () {
        overviewRun('2026-01-01 09:30:00');
        overviewRun('2026-01-01 10:30:00');
        overviewRun('2026-01-01 11:30:00', ['status' => Status::Failed]);

        $body = overviewAt($this, 'from=2026-01-01T10:00:00Z&to=2026-01-01T12:00:00Z');

        expect($body['range'])->toBe(['preset' => null, 'from' => '2026-01-01T10:00:00.000Z', 'to' => '2026-01-01T12:00:00.000Z'])
            ->and($body['previous_range'])->toBe(['from' => '2026-01-01T08:00:00.000Z', 'to' => '2026-01-01T10:00:00.000Z'])
            ->and($body['data']['summary']['runs'])->toBe(overviewCounts(completed: 1, failed: 1))
            ->and($body['data']['previous']['runs'])->toBe(overviewCounts(completed: 1));
    });
});

describe('the error rate', function () {
    it('has incomplete runs in the denominator and not in the failures, and leaves running and awaiting runs out', function () {
        overviewRun('2026-01-02 10:00:00', ['status' => Status::Failed]);
        overviewRun('2026-01-02 10:01:00');
        overviewRun('2026-01-02 10:02:00', ['status' => Status::Incomplete]);
        overviewRun('2026-01-02 10:03:00', ['status' => Status::Incomplete]);
        overviewRun('2026-01-02 10:04:00', ['status' => Status::Running]);
        overviewRun('2026-01-02 10:05:00', ['status' => Status::AwaitingApproval]);

        expect(overviewAt($this)['data']['summary']['error_rate'])->toBe(['rate' => 0.25, 'failed' => 1, 'finished' => 4]);
    });

    it('rounds to ten places', function () {
        overviewRun('2026-01-02 10:00:00', ['status' => Status::Failed]);
        overviewRun('2026-01-02 10:01:00');
        overviewRun('2026-01-02 10:02:00');

        expect(overviewAt($this)['data']['summary']['error_rate']['rate'])->toBe(0.3333333333);
    });

    it('is null, not zero, when nothing has finished', function () {
        overviewRun('2026-01-02 10:04:00', ['status' => Status::Running]);
        overviewRun('2026-01-02 10:05:00', ['status' => Status::AwaitingApproval]);

        expect(overviewAt($this)['data']['summary']['error_rate'])->toBe(['rate' => null, 'failed' => 0, 'finished' => 0]);
    });
});

describe('the duration', function () {
    it('has no 95th percentile below twenty measured runs', function () {
        foreach (range(1, 19) as $i) {
            overviewRun('2026-01-02 10:00:00', ['duration_ms' => $i * 100]);
        }

        $duration = overviewAt($this)['data']['summary']['duration'];

        expect($duration['p95_ms'])->toBeNull()
            ->and($duration['measured'])->toBe(19)
            ->and($duration['p95_minimum'])->toBe(20);
    });

    it('takes the nearest rank over the measured runs of every status, and the average over the same runs', function () {
        // Twenty measured runs, one of them failed, and five that have no duration and are in neither figure.
        foreach (range(1, 20) as $i) {
            overviewRun('2026-01-02 10:00:00', ['duration_ms' => $i * 100, 'status' => $i === 20 ? Status::Failed : Status::Completed]);
        }

        foreach (range(1, 5) as $ignored) {
            overviewRun('2026-01-02 10:00:00');
        }

        $duration = overviewAt($this)['data']['summary']['duration'];

        // Rank = ceil(0.95 * 20) = 19: the 19th shortest.
        expect($duration)->toBe(['average_ms' => 1050, 'p95_ms' => 1900, 'measured' => 20, 'not_measured' => 5, 'p95_minimum' => 20]);
    });

    it('takes the rank from the count of measured runs, not of all runs', function () {
        foreach (range(1, 40) as $i) {
            overviewRun('2026-01-02 10:00:00', ['duration_ms' => $i]);
        }

        // ceil(0.95 * 40) = 38.
        expect(overviewAt($this)['data']['summary']['duration']['p95_ms'])->toBe(38);
    });

    it('rounds the average to the thousandth of a millisecond, in the summary and in a bucket', function () {
        overviewRun('2026-01-02 10:10:00', ['duration_ms' => 1]);
        overviewRun('2026-01-02 10:20:00', ['duration_ms' => 1]);
        overviewRun('2026-01-02 10:30:00', ['duration_ms' => 2]);

        $data = overviewAt($this)['data'];

        expect($data['summary']['duration']['average_ms'])->toBe(1.333)
            ->and($data['series']['buckets'][22]['duration'])->toBe(['average_ms' => 1.333, 'measured' => 3]);
    });

    it('rounds the rank up when the count does not divide evenly', function () {
        foreach (range(1, 25) as $i) {
            overviewRun('2026-01-02 10:00:00', ['duration_ms' => $i]);
        }

        // ceil(0.95 * 25) = ceil(23.75) = 24.
        expect(overviewAt($this)['data']['summary']['duration']['p95_ms'])->toBe(24);
    });

    it('computes the percentile of each period over its own runs', function () {
        foreach (range(1, 20) as $i) {
            overviewRun('2026-01-02 10:00:00', ['duration_ms' => $i * 10]);
            overviewRun('2026-01-01 10:00:00', ['duration_ms' => $i * 1000]);
        }

        $data = overviewAt($this)['data'];

        expect($data['summary']['duration']['p95_ms'])->toBe(190)
            ->and($data['previous']['duration']['p95_ms'])->toBe(19000);
    });
});

describe('usage', function () {
    it('sums what each run reported, leaves a count nobody reported null, and counts coverage', function () {
        overviewRun('2026-01-02 10:00:00', ['input_tokens' => 100, 'output_tokens' => 10, 'reasoning_tokens' => 4]);
        overviewRun('2026-01-02 10:01:00', ['input_tokens' => 50]);
        overviewRun('2026-01-02 10:02:00', ['reasoning_tokens' => 0]);
        overviewRun('2026-01-02 10:03:00');

        $summary = overviewAt($this)['data']['summary'];

        expect($summary['usage'])->toBe([
            'state' => 'reported', 'input_tokens' => 150, 'output_tokens' => 10, 'cache_read_tokens' => null,
            'cache_write_tokens' => null, 'reasoning_tokens' => 4, 'total_tokens' => 160,
        ])->and($summary['usage_coverage'])->toBe(['reported' => 3, 'not_reported' => 1]);
    });

    it('is not reported when no run reported a count', function () {
        overviewRun('2026-01-02 10:03:00');

        $summary = overviewAt($this)['data']['summary'];

        expect($summary['usage']['state'])->toBe('not_reported')
            ->and($summary['usage']['total_tokens'])->toBeNull()
            ->and($summary['usage_coverage'])->toBe(['reported' => 0, 'not_reported' => 1]);
    });
});

describe('cost', function () {
    it('has the state of a run\'s cost, with the numbers behind it', function (array $rows, array $cost, array $coverage) {
        foreach ($rows as $row) {
            overviewRun('2026-01-02 10:00:00', $row);
        }

        $summary = overviewAt($this)['data']['summary'];

        expect($summary['cost'])->toBe($cost)
            ->and($summary['cost_coverage'])->toBe($coverage);
    })->with([
        'estimated' => [[['cost' => 0.002], ['cost' => 0.003]], ['state' => 'estimated', 'amount' => 0.005], ['unpriced_runs' => 0, 'runs_without_amount' => 0]],
        'partial' => [[['cost' => 0.004, 'unpriced_span_count' => 1], ['cost' => 0.001]], ['state' => 'partial', 'amount' => 0.005], ['unpriced_runs' => 1, 'runs_without_amount' => 0]],
        'unpriced' => [[['unpriced_span_count' => 2], ['unpriced_span_count' => 1]], ['state' => 'unpriced', 'amount' => null], ['unpriced_runs' => 2, 'runs_without_amount' => 2]],
        'not captured' => [[[], []], ['state' => 'not_captured', 'amount' => null], ['unpriced_runs' => 0, 'runs_without_amount' => 2]],
        'pending with an amount so far' => [[['status' => Status::Running, 'cost' => 0.001], ['cost' => 0.002]], ['state' => 'pending', 'amount' => 0.003], ['unpriced_runs' => 0, 'runs_without_amount' => 0]],
        'pending with none yet' => [[['status' => Status::Running]], ['state' => 'pending', 'amount' => null], ['unpriced_runs' => 0, 'runs_without_amount' => 1]],
    ]);

    it('adds the buckets\' sums in PHP and rounds the total to ten places', function () {
        overviewRun('2026-01-02 09:10:00', ['cost' => '0.1234567891']);
        overviewRun('2026-01-02 10:10:00', ['cost' => '0.2345678912']);
        overviewRun('2026-01-02 11:10:00', ['cost' => '0.0123456789']);

        $data = overviewAt($this)['data'];
        $amounts = array_filter(array_column(array_column($data['series']['buckets'], 'cost'), 'amount'), fn ($amount) => $amount !== null);

        expect(array_values($amounts))->toBe([0.1234567891, 0.2345678912, 0.0123456789])
            ->and($data['summary']['cost']['amount'])->toBe(0.3703703592)
            ->and($data['summary']['cost']['amount'])->toBe(round(array_sum($amounts), 10));
    });

    it('rounds the previous period\'s amount, one sum from the database, to ten places', function () {
        overviewRun('2025-12-31 13:00:00', ['cost' => '0.1234567891']);
        overviewRun('2026-01-01 08:00:00', ['cost' => '0.2345678912']);
        overviewRun('2026-01-02 08:00:00', ['cost' => '0.5']);

        $data = overviewAt($this)['data'];

        expect($data['previous']['cost'])->toBe(['state' => 'estimated', 'amount' => 0.3580246803])
            ->and($data['summary']['cost'])->toBe(['state' => 'estimated', 'amount' => 0.5]);
    });
});

describe('the series', function () {
    it('cuts each preset along the clock, with the first and last bucket cut to the range', function (string $range, string $unit, int $count, string $firstFrom, string $firstTo, string $lastFrom, string $lastTo) {
        Carbon::setTestNow('2026-01-02 12:34:56');

        $body = overviewAt($this, "range={$range}");
        $buckets = $body['data']['series']['buckets'];

        expect($body['data']['series']['bucket'])->toBe($unit)
            ->and($buckets)->toHaveCount($count)
            ->and($buckets[0])->toMatchArray(['from' => $firstFrom, 'to' => $firstTo, 'full' => false, 'in_progress' => false])
            ->and($buckets[$count - 1])->toMatchArray(['from' => $lastFrom, 'to' => $lastTo, 'full' => false, 'in_progress' => true]);

        // Contiguous, in order, full in between, and only the last one is in progress.
        foreach ($buckets as $index => $bucket) {
            if ($index > 0) {
                expect($bucket['from'])->toBe($buckets[$index - 1]['to']);
            }

            if ($index > 0 && $index < $count - 1) {
                expect($bucket['full'])->toBeTrue();
            }

            if ($index < $count - 1) {
                expect($bucket['in_progress'])->toBeFalse();
            }
        }

        expect($buckets[0]['from'])->toBe($body['range']['from'])
            ->and($buckets[$count - 1]['to'])->toBe($body['range']['to']);
    })->with([
        '1h' => ['1h', '5m', 13, '2026-01-02T11:34:56.000Z', '2026-01-02T11:35:00.000Z', '2026-01-02T12:30:00.000Z', '2026-01-02T12:34:56.000Z'],
        '24h' => ['24h', 'hour', 25, '2026-01-01T12:34:56.000Z', '2026-01-01T13:00:00.000Z', '2026-01-02T12:00:00.000Z', '2026-01-02T12:34:56.000Z'],
        '7d' => ['7d', 'day', 8, '2025-12-26T12:34:56.000Z', '2025-12-27T00:00:00.000Z', '2026-01-02T00:00:00.000Z', '2026-01-02T12:34:56.000Z'],
    ]);

    it('has one bucket fewer when the clock is exactly on an edge, and every bucket is full', function (string $range, int $count) {
        Carbon::setTestNow('2026-01-02 00:00:00');

        $buckets = overviewAt($this, "range={$range}")['data']['series']['buckets'];

        expect($buckets)->toHaveCount($count)
            ->and(array_unique(array_column($buckets, 'full')))->toBe([true])
            ->and(array_unique(array_column($buckets, 'in_progress')))->toBe([false]);
    })->with([['1h', 12], ['24h', 24], ['7d', 7]]);

    it('has a bucket for a range that is not on an edge at either end, and says it is cut at both', function () {
        $buckets = overviewAt($this, 'from=2026-01-02T10:07:00Z&to=2026-01-02T10:08:00Z')['data']['series']['buckets'];

        expect($buckets)->toHaveCount(1)
            ->and($buckets[0])->toMatchArray(['from' => '2026-01-02T10:07:00.000Z', 'to' => '2026-01-02T10:08:00.000Z', 'full' => false]);
    });

    describe('in progress', function () {
        beforeEach(fn () => Carbon::setTestNow('2026-01-02 12:34:56'));

        /**
         * @return list<string> the `from` of each bucket that is in progress
         */
        function overviewOpen(mixed $test, string $query): array
        {
            $buckets = overviewAt($test, $query)['data']['series']['buckets'];

            return array_column(array_filter($buckets, fn (array $bucket) => $bucket['in_progress']), 'from');
        }

        it('is the bucket of a range that ends now, and only the last', function () {
            expect(overviewOpen($this, 'from=2026-01-02T10:00:00Z&to=2026-01-02T12:34:56Z'))->toBe(['2026-01-02T12:00:00.000Z'])
                ->and(overviewOpen($this, 'range=24h'))->toBe(['2026-01-02T12:00:00.000Z']);
        });

        it('is no bucket of a range that ended before the clock bucket that holds now began', function () {
            expect(overviewOpen($this, 'from=2026-01-02T08:00:00Z&to=2026-01-02T11:59:59Z'))->toBe([]);
        });

        it('is by the clock, so the last bucket of a range that ended minutes ago is still open', function () {
            expect(overviewOpen($this, 'from=2026-01-02T10:00:00Z&to=2026-01-02T12:30:00Z'))->toBe(['2026-01-02T12:00:00.000Z']);
        });

        it('is not the last bucket of a range that ends in the future when that bucket has not started', function () {
            // Five-minute buckets 12:00 to 13:50: the one holding 12:34:56 is 12:30, and the last one starts at 13:45.
            $buckets = overviewAt($this, 'from=2026-01-02T12:00:00Z&to=2026-01-02T13:50:00Z')['data']['series']['buckets'];

            expect(overviewOpen($this, 'from=2026-01-02T12:00:00Z&to=2026-01-02T13:50:00Z'))->toBe(['2026-01-02T12:30:00.000Z'])
                ->and(end($buckets)['in_progress'])->toBeFalse();
        });

        it('is no bucket of a range that starts in the future', function () {
            expect(overviewOpen($this, 'from=2026-01-02T13:00:00Z&to=2026-01-02T14:00:00Z'))->toBe([]);
        });
    });

    it('sends every bucket, with an empty one between two busy ones', function () {
        overviewRun('2026-01-02 09:10:00', ['duration_ms' => 100, 'cost' => 0.5]);
        overviewRun('2026-01-02 11:10:00', ['status' => Status::Failed]);

        $buckets = overviewAt($this)['data']['series']['buckets'];

        expect($buckets)->toHaveCount(24)
            ->and($buckets[21])->toMatchArray(['from' => '2026-01-02T09:00:00.000Z', 'runs' => overviewCounts(completed: 1), 'duration' => ['average_ms' => 100, 'measured' => 1], 'cost' => ['state' => 'estimated', 'amount' => 0.5], 'unpriced_runs' => 0])
            ->and($buckets[22])->toMatchArray(['from' => '2026-01-02T10:00:00.000Z', 'runs' => overviewCounts(), 'duration' => ['average_ms' => null, 'measured' => 0], 'cost' => ['state' => 'not_captured', 'amount' => null], 'unpriced_runs' => 0])
            ->and($buckets[23])->toMatchArray(['from' => '2026-01-02T11:00:00.000Z', 'runs' => overviewCounts(failed: 1)]);
    });

    it('tells an all-unpriced bucket from a partly priced one', function () {
        overviewRun('2026-01-02 09:10:00', ['unpriced_span_count' => 2]);
        overviewRun('2026-01-02 10:10:00', ['cost' => 0.4, 'unpriced_span_count' => 1]);
        overviewRun('2026-01-02 10:20:00', ['cost' => 0.1]);

        $buckets = overviewAt($this)['data']['series']['buckets'];

        expect($buckets[21]['cost'])->toBe(['state' => 'unpriced', 'amount' => null])
            ->and($buckets[21]['unpriced_runs'])->toBe(1)
            ->and($buckets[22]['cost'])->toBe(['state' => 'partial', 'amount' => 0.5])
            ->and($buckets[22]['unpriced_runs'])->toBe(1);
    });

    it('adds up to the summary', function () {
        overviewMixedDataset();
        overviewRun('2026-01-01 12:30:00');

        $data = overviewAt($this)['data'];
        $total = array_fill_keys(array_keys($data['summary']['runs']), 0);

        foreach ($data['series']['buckets'] as $bucket) {
            foreach ($bucket['runs'] as $status => $count) {
                $total[$status] += $count;
            }
        }

        // The summary is built from the buckets, so this alone cannot fail. The list below is the real check.
        expect($total)->toBe($data['summary']['runs'])->and($total['all'])->toBe(9);
    });

    it('has the list\'s counts for the range and for each of several buckets, read from the list itself', function () {
        overviewMixedDataset();
        overviewRun('2026-01-01 12:30:00', ['status' => Status::Failed]);

        $data = overviewAt($this)['data'];
        $range = $this->getJson('/trail/api/traces?range=24h')->assertOk()->json('status_counts');

        expect($data['summary']['runs'])->toBe($range)->and($range['all'])->toBe(9);

        foreach ([0, 18, 19, 20, 21, 22, 23] as $index) {
            $bucket = $data['series']['buckets'][$index];
            $list = $this->getJson('/trail/api/traces?from='.urlencode($bucket['from']).'&to='.urlencode($bucket['to']))->assertOk()->json('status_counts');

            expect($bucket['runs'])->toBe($list);
        }
    });

    it('counts a run at a bucket\'s edge in the bucket that starts there', function () {
        overviewRun('2026-01-02 10:00:00', ['id' => 'on-the-hour']);

        $buckets = overviewAt($this)['data']['series']['buckets'];

        expect($buckets[21]['runs']['all'])->toBe(0)
            ->and($buckets[22]['runs']['all'])->toBe(1);
    });

    describe('in the application\'s timezone', function () {
        it('starts day buckets at local midnight', function () {
            config(['app.timezone' => 'Asia/Tokyo']);
            Carbon::setTestNow(Carbon::parse('2026-01-04 12:00:00', 'Asia/Tokyo'));
            // Stored and read as local times.
            overviewRun('2026-01-02 23:59:59', ['id' => 'before-midnight']);
            overviewRun('2026-01-03 00:00:01', ['id' => 'after-midnight']);

            $buckets = overviewAt($this, 'range=7d')['data']['series']['buckets'];
            $day = fn (string $from) => collect($buckets)->firstWhere('from', $from);

            expect($buckets)->toHaveCount(8)
                ->and($buckets[1]['from'])->toBe('2025-12-28T15:00:00.000Z')
                ->and($day('2026-01-01T15:00:00.000Z')['runs']['all'])->toBe(1)
                ->and($day('2026-01-02T15:00:00.000Z')['runs']['all'])->toBe(1)
                ->and($day('2026-01-01T15:00:00.000Z')['to'])->toBe('2026-01-02T15:00:00.000Z');
        });

        it('makes a day with a clock change one bucket, 23 hours long in spring', function () {
            config(['app.timezone' => 'Europe/Berlin']);
            Carbon::setTestNow(Carbon::parse('2026-04-02 12:00:00', 'Europe/Berlin'));
            overviewRun('2026-03-29 03:30:00', ['id' => 'after-the-change']);

            $buckets = overviewAt($this, 'from=2026-03-28T00:00:00&to=2026-03-31T00:00:00')['data']['series'];

            expect($buckets['bucket'])->toBe('day')
                ->and($buckets['buckets'])->toHaveCount(3)
                ->and($buckets['buckets'][1])->toMatchArray(['from' => '2026-03-28T23:00:00.000Z', 'to' => '2026-03-29T22:00:00.000Z', 'full' => true])
                ->and($buckets['buckets'][1]['runs']['all'])->toBe(1);
        });

        it('makes a day with a clock change one bucket, 25 hours long in autumn', function () {
            config(['app.timezone' => 'Europe/Berlin']);
            Carbon::setTestNow(Carbon::parse('2026-10-28 12:00:00', 'Europe/Berlin'));

            $buckets = overviewAt($this, 'from=2026-10-24T00:00:00&to=2026-10-27T00:00:00')['data']['series']['buckets'];

            expect($buckets)->toHaveCount(3)
                ->and($buckets[1])->toMatchArray(['from' => '2026-10-24T22:00:00.000Z', 'to' => '2026-10-25T23:00:00.000Z']);
        });

        it('aligns hours and five minutes to the local clock of a zone with a half-hour offset', function () {
            config(['app.timezone' => 'Asia/Kolkata']);
            Carbon::setTestNow(Carbon::parse('2026-01-02 12:00:00', 'Asia/Kolkata'));

            $buckets = overviewAt($this, 'from=2026-01-02T08:10:00&to=2026-01-02T12:00:00')['data']['series']['buckets'];

            // Local 08:10 is 02:40Z, and the next whole local hour is 09:00 = 03:30Z.
            expect($buckets)->toHaveCount(4)
                ->and($buckets[0])->toMatchArray(['from' => '2026-01-02T02:40:00.000Z', 'to' => '2026-01-02T03:30:00.000Z', 'full' => false])
                ->and($buckets[1])->toMatchArray(['from' => '2026-01-02T03:30:00.000Z', 'to' => '2026-01-02T04:30:00.000Z', 'full' => true]);
        });
    });
});

describe('the hour a clock is set back', function () {
    beforeEach(function () {
        config(['app.timezone' => 'America/New_York']);
        Carbon::setTestNow(Carbon::parse('2026-11-03 12:00:00', 'America/New_York'));
    });

    /**
     * @param  array<string, mixed>  $series
     * @return list<array<string, mixed>>
     */
    function overviewAgainstList(mixed $test, array $series): array
    {
        foreach ($series as $bucket) {
            $list = $test->getJson('/trail/api/traces?from='.urlencode($bucket['from']).'&to='.urlencode($bucket['to']))->assertOk()->json('status_counts');

            expect($bucket['runs'])->toBe($list);
        }

        return $series;
    }

    it('is one bucket of hours, holding the runs of both passes', function () {
        // The capture stores the local time, so both passes of the hour are stored as 01:xx.
        overviewRun('2026-11-01 00:30:00', ['id' => 'before']);
        overviewRun('2026-11-01 01:10:00', ['id' => 'first-pass']);
        overviewRun('2026-11-01 01:50:00', ['id' => 'second-pass', 'status' => Status::Failed]);
        overviewRun('2026-11-01 02:30:00', ['id' => 'after']);

        $body = overviewAt($this, 'from=2026-11-01T00:00:00-04:00&to=2026-11-01T04:00:00-05:00');
        $buckets = overviewAgainstList($this, $body['data']['series']['buckets']);

        expect($body['data']['series']['bucket'])->toBe('hour')
            ->and(array_column($buckets, 'from'))->toBe(['2026-11-01T04:00:00.000Z', '2026-11-01T05:00:00.000Z', '2026-11-01T07:00:00.000Z', '2026-11-01T08:00:00.000Z'])
            ->and(array_column($buckets, 'to'))->toBe(['2026-11-01T05:00:00.000Z', '2026-11-01T07:00:00.000Z', '2026-11-01T08:00:00.000Z', '2026-11-01T09:00:00.000Z'])
            ->and(array_column($buckets, 'full'))->toBe([true, true, true, true])
            ->and(array_column(array_column($buckets, 'runs'), 'all'))->toBe([1, 2, 1, 0])
            ->and($buckets[1]['runs'])->toBe(overviewCounts(completed: 1, failed: 1))
            ->and($body['data']['summary']['runs'])->toBe(overviewCounts(completed: 3, failed: 1))
            ->and(array_sum(array_column(array_column($buckets, 'runs'), 'all')))->toBe($body['data']['summary']['runs']['all']);

        $list = $this->getJson('/trail/api/traces?from=2026-11-01T00:00:00-04:00&to=2026-11-01T04:00:00-05:00')->json('status_counts');

        expect($body['data']['summary']['runs'])->toBe($list);
    });

    it('is one bucket of five minutes, longer than its unit', function () {
        overviewRun('2026-11-01 00:52:00', ['id' => 'before']);
        overviewRun('2026-11-01 01:10:00', ['id' => 'first-pass']);
        overviewRun('2026-11-01 01:40:00', ['id' => 'second-pass', 'status' => Status::Failed]);

        $body = overviewAt($this, 'from=2026-11-01T00:50:00-04:00&to=2026-11-01T01:50:00-05:00');
        $buckets = overviewAgainstList($this, $body['data']['series']['buckets']);

        expect($body['data']['series']['bucket'])->toBe('5m')
            ->and(array_column($buckets, 'from'))->toBe(['2026-11-01T04:50:00.000Z', '2026-11-01T04:55:00.000Z', '2026-11-01T05:00:00.000Z'])
            ->and(array_column($buckets, 'to'))->toBe(['2026-11-01T04:55:00.000Z', '2026-11-01T05:00:00.000Z', '2026-11-01T06:50:00.000Z'])
            ->and(array_column(array_column($buckets, 'runs'), 'all'))->toBe([1, 0, 2])
            ->and($body['data']['summary']['runs']['all'])->toBe(3);
    });

    it('ends the merged bucket at the end of the repeated hour when the range goes on', function () {
        overviewRun('2026-11-01 01:20:00');
        overviewRun('2026-11-01 02:20:00');

        $body = overviewAt($this, 'from=2026-11-01T01:00:00-04:00&to=2026-11-01T03:00:00-05:00');
        $buckets = overviewAgainstList($this, $body['data']['series']['buckets']);

        // 01:00 EDT to 03:00 EST is 3 hours: hour buckets, 01:00 EDT-02:00 EST and 02:00-03:00 EST.
        expect(array_column($buckets, 'from'))->toBe(['2026-11-01T05:00:00.000Z', '2026-11-01T07:00:00.000Z'])
            ->and(array_column(array_column($buckets, 'runs'), 'all'))->toBe([1, 1]);
    });

    it('splits the runs of a range or a previous window that begins inside the hour by their stored time', function () {
        overviewRun('2026-11-01 01:10:00', ['id' => 'early']);
        overviewRun('2026-11-01 01:40:00', ['id' => 'late']);

        $body = overviewAt($this, 'from=2026-11-01T01:30:00-05:00&to=2026-11-01T05:30:00-05:00');

        // The range starts at stored time 01:30: the run stored 01:40 is in it, the one stored 01:10 is in the window before it.
        expect($body['data']['summary']['runs']['all'])->toBe(1)
            ->and($body['data']['previous']['runs']['all'])->toBe(1)
            ->and(array_sum(array_column(array_column($body['data']['series']['buckets'], 'runs'), 'all')))->toBe(1);
    });

    it('leaves no phantom bucket where the clock goes forward', function () {
        overviewRun('2026-03-08 03:30:00', ['id' => 'after-the-change']);

        $body = overviewAt($this, 'from=2026-03-08T00:00:00-05:00&to=2026-03-08T05:00:00-04:00');
        $buckets = overviewAgainstList($this, $body['data']['series']['buckets']);

        expect($body['data']['series']['bucket'])->toBe('hour')
            ->and(array_column($buckets, 'from'))->toBe(['2026-03-08T05:00:00.000Z', '2026-03-08T06:00:00.000Z', '2026-03-08T07:00:00.000Z', '2026-03-08T08:00:00.000Z'])
            ->and(array_column($buckets, 'to'))->toBe(['2026-03-08T06:00:00.000Z', '2026-03-08T07:00:00.000Z', '2026-03-08T08:00:00.000Z', '2026-03-08T09:00:00.000Z'])
            ->and(array_column(array_column($buckets, 'runs'), 'all'))->toBe([0, 0, 1, 0]);
    });

    it('leaves a day alone', function () {
        $buckets = overviewAt($this, 'from=2026-10-31T00:00:00&to=2026-11-03T00:00:00')['data']['series']['buckets'];

        expect(array_column($buckets, 'to'))->toBe(['2026-11-01T04:00:00.000Z', '2026-11-02T05:00:00.000Z', '2026-11-03T05:00:00.000Z']);
    });
});

describe('an explicit range', function () {
    it('picks the unit by length, with the bounds inclusive', function (string $from, string $to, string $unit, int $count) {
        $series = overviewAt($this, "from={$from}&to={$to}")['data']['series'];

        expect($series['bucket'])->toBe($unit)->and($series['buckets'])->toHaveCount($count);
    })->with([
        'two hours is five minutes' => ['2026-01-02T10:00:00Z', '2026-01-02T12:00:00Z', '5m', 24],
        'a second more is hours' => ['2026-01-02T10:00:00Z', '2026-01-02T12:00:01Z', 'hour', 3],
        'forty-eight hours is hours' => ['2025-12-30T12:00:00Z', '2026-01-01T12:00:00Z', 'hour', 48],
        'a second more is days' => ['2025-12-30T12:00:00Z', '2026-01-01T12:00:01Z', 'day', 3],
        'ninety-two days is days' => ['2025-10-02T00:00:00Z', '2026-01-02T00:00:00Z', 'day', 92],
    ]);

    it('reaches its real maximum of buckets for each unit', function (string $from, string $to, string $unit, int $count) {
        $series = overviewAt($this, "from={$from}&to={$to}")['data']['series'];

        expect($series['bucket'])->toBe($unit)->and($series['buckets'])->toHaveCount($count);
    })->with([
        'two hours, off the clock' => ['2026-01-02T10:01:00Z', '2026-01-02T12:01:00Z', '5m', 25],
        'forty-eight hours, off the clock' => ['2026-01-01T10:30:00Z', '2026-01-03T10:30:00Z', 'hour', 49],
        'ninety-two days, off the clock' => ['2025-10-02T00:30:00Z', '2026-01-02T00:30:00Z', 'day', 93],
    ]);

    it('reaches 94 days for 92 times 24 hours that start late on the day before the clock goes forward', function () {
        config(['app.timezone' => 'America/New_York']);

        // 2026-03-08 is 23 hours long in New York.
        $series = overviewAt($this, 'from=2026-03-07T23:30:00-05:00&to=2026-06-08T00:30:00-04:00')['data']['series'];

        expect($series['bucket'])->toBe('day')
            ->and($series['buckets'])->toHaveCount(94)
            ->and($series['buckets'][1])->toMatchArray(['from' => '2026-03-08T05:00:00.000Z', 'to' => '2026-03-09T04:00:00.000Z', 'full' => true]);
    });

    it('refuses a range longer than ninety-two days', function () {
        $this->getJson('/trail/api/overview?from=2025-10-02T00:00:00Z&to=2026-01-02T00:00:01Z')
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['from'])
            ->assertJsonPath('errors.from.0', 'The range is too long: at most 92 days.');
    });

    it('keeps the errors of a time range', function () {
        $this->getJson('/trail/api/overview?range=7d&from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z')->assertUnprocessable()->assertJsonValidationErrors(['range']);
        $this->getJson('/trail/api/overview?range=30d')->assertUnprocessable()->assertJsonValidationErrors(['range']);
        $this->getJson('/trail/api/overview?from=2026-01-01T00:00:00Z')->assertUnprocessable()->assertJsonValidationErrors(['to']);
    });
});

it('ignores every parameter but the range', function () {
    overviewRun('2026-01-02 10:00:00', ['name' => 'Alpha']);
    overviewRun('2026-01-02 10:01:00', ['name' => 'Beta', 'status' => Status::Failed]);

    expect(overviewAt($this, 'agent=Alpha&status=failed&page=9&slow=1')['data']['summary']['runs'])->toBe(overviewCounts(completed: 1, failed: 1));
});

describe('against the list of runs', function () {
    it('has the list\'s status counts, for any range', function (string $query) {
        overviewMixedDataset();
        overviewRun('2025-12-31 20:00:00', ['status' => Status::Failed]);
        overviewRun('2025-12-31 21:00:00', ['status' => Status::Running, 'created_at' => Carbon::now()->subHours(3)]);

        $overview = overviewAt($this, $query)['data']['summary']['runs'];
        $list = $this->getJson('/trail/api/traces?'.$query)->assertOk()->json('status_counts');

        expect($overview)->toBe($list)->and($overview['all'])->toBeGreaterThan(0);
    })->with(['24h' => 'range=24h', '7d' => 'range=7d', '1h' => 'range=1h', 'explicit' => 'from=2026-01-02T08:30:00Z&to=2026-01-02T10:30:00Z']);

    it('counts as unpriced the runs the list keeps with unpriced=1', function () {
        overviewMixedDataset();
        overviewRun('2026-01-02 09:30:00', ['unpriced_span_count' => 3]);
        overviewRun('2026-01-02 09:31:00', ['unpriced_span_count' => 1, 'cost' => 0.1]);

        $unpriced = overviewAt($this)['data']['summary']['cost_coverage']['unpriced_runs'];

        expect($unpriced)->toBe(3)
            ->and($this->getJson('/trail/api/traces?unpriced=1')->json('pagination.total'))->toBe($unpriced);
    });

    it('has, for a bucket, the status counts the list gives for the bucket\'s bounds', function (int $index) {
        Carbon::setTestNow('2026-01-02 12:34:56');
        overviewRun('2026-01-01 12:40:00', ['status' => Status::Failed]);
        overviewRun('2026-01-01 12:59:59.999');
        overviewRun('2026-01-01 13:00:00');
        overviewRun('2026-01-02 06:10:00', ['status' => Status::Running, 'created_at' => Carbon::now()->subHours(3)]);
        overviewRun('2026-01-02 06:50:00', ['status' => Status::AwaitingApproval]);
        overviewRun('2026-01-02 12:00:00');
        overviewRun('2026-01-02 12:34:55.999', ['status' => Status::Failed]);

        $buckets = overviewAt($this)['data']['series']['buckets'];
        $bucket = $buckets[$index >= 0 ? $index : count($buckets) + $index];
        $list = $this->getJson('/trail/api/traces?from='.urlencode($bucket['from']).'&to='.urlencode($bucket['to']))->assertOk()->json('status_counts');

        expect($bucket['runs'])->toBe($list)->and($bucket['runs']['all'])->toBeGreaterThan(0);
    })->with(['the first (cut)' => 0, 'a middle one' => 18, 'the last (cut)' => -1]);
});

describe('the reads', function () {
    it('are three when both periods have enough runs for a percentile', function () {
        foreach (range(1, 20) as $i) {
            overviewRun('2026-01-02 10:00:00', ['duration_ms' => $i]);
            overviewRun('2026-01-01 10:00:00', ['duration_ms' => $i]);
        }

        $statements = overviewStatements(fn () => overviewAt($this));

        expect($statements)->toHaveCount(3);
    });

    it('are two when only one period has enough', function () {
        foreach (range(1, 20) as $i) {
            overviewRun('2026-01-02 10:00:00', ['duration_ms' => $i]);
        }

        overviewRun('2026-01-01 10:00:00', ['duration_ms' => 5]);

        expect(overviewStatements(fn () => overviewAt($this)))->toHaveCount(2);
    });

    it('are one when neither period has enough, whatever the range', function (string $range) {
        overviewMixedDataset();

        expect(overviewStatements(fn () => overviewAt($this, $range)))->toHaveCount(1);
    })->with(['range=1h', 'range=24h', 'range=7d', 'from=2025-10-02T00:00:00Z&to=2026-01-02T00:00:00Z']);

    it('are one when there are no runs', function () {
        expect(overviewStatements(fn () => overviewAt($this)))->toHaveCount(1);
    });
});

describe('access', function () {
    it('answers a denied request with a JSON 403', function () {
        $this->app['env'] = 'production';

        $this->get('/trail/api/overview', ['Accept' => 'text/html'])->assertForbidden()->assertJsonStructure(['message']);

        Trail::auth(fn () => true);
        $this->get('/trail/api/overview', ['Accept' => 'text/html'])->assertOk();

        Trail::auth(fn () => false);
        $this->get('/trail/api/overview', ['Accept' => 'text/html'])->assertForbidden();
    });

    it('answers a JSON 404 when the dashboard is switched off', function () {
        config(['trail.dashboard.enabled' => false]);

        $this->get('/trail/api/overview', ['Accept' => 'text/html'])->assertNotFound()->assertJsonStructure(['message']);
    });

    it('answers a JSON 422 for a bad range even when HTML is asked for', function () {
        $this->get('/trail/api/overview?range=bad', ['Accept' => 'text/html'])->assertUnprocessable()->assertJsonValidationErrors(['range']);
    });
});
