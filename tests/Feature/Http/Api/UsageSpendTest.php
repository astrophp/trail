<?php

use Astro\Trail\Enums\Status;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Pricing\PriceBook;
use Astro\Trail\Queries\OverviewBucket;
use Astro\Trail\Queries\RunFigures;
use Astro\Trail\Queries\SpendQuery;
use Astro\Trail\Tests\Fixtures\Http\AgentRows;
use Astro\Trail\Tests\Fixtures\Http\UsageRows;
use Carbon\CarbonImmutable;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/*
 * The clock is fixed at 12:30 on 2 January 2026 unless a test sets another. Prices (USD per million tokens):
 *
 *   alpha  input 2, output 10, cache read 0.5, cache write 4
 *   plain  input 2, output 10 (no cache rates)
 *   free   input 0, output 0
 *   embed  input 0.1 (no output rate)
 *
 * A step of the helper below is 1,000,000 input and 100,000 output tokens, which costs 2 + 1 = 3 on alpha
 * and on plain, and its recorded cost is 3 as well. The "big" step is 100,000,000 input tokens: 200.
 */
beforeEach(function () {
    $this->app['env'] = 'local';
    Carbon::setTestNow('2026-01-02 12:30:00');
    config(['trail.pricing' => [
        'acme' => [
            'alpha' => ['input' => 2.0, 'output' => 10.0, 'cache_read' => 0.5, 'cache_write' => 4.0],
            'plain' => ['input' => 2.0, 'output' => 10.0],
            'free' => ['input' => 0.0, 'output' => 0.0],
            'embed' => ['input' => 0.1],
        ],
    ]]);
});

afterEach(function () {
    Carbon::setTestNow();
    config(['app.timezone' => 'UTC']);
    $this->app['env'] = 'testing';
});

/**
 * A step of three: 1,000,000 input and 100,000 output tokens.
 *
 * @param  array<string, mixed>  $attributes
 * @return array<string, mixed>
 */
function spendStep(array $attributes = [], string $model = 'alpha'): array
{
    return UsageRows::step('acme', $model, ['inputTokens' => 1_000_000, 'outputTokens' => 100_000, 'cost' => 3.0, ...$attributes]);
}

/**
 * A step of two hundred.
 *
 * @return array<string, mixed>
 */
function spendBigStep(): array
{
    return UsageRows::step('acme', 'alpha', ['inputTokens' => 100_000_000, 'outputTokens' => 0, 'cost' => 200.0]);
}

/**
 * @param  list<array<string, mixed>>  $steps
 * @param  array<string, mixed>  $trace
 */
function spendRun(string $started, array $steps, array $trace = [], ?string $storedAt = null): string
{
    return UsageRows::run('Agent', $started, $steps, $trace, $storedAt);
}

/**
 * @return array<string, mixed>
 */
function spendAt(mixed $test, string $query = ''): array
{
    return $test->getJson('/trail/api/usage/spend'.($query === '' ? '' : '?'.$query))->assertOk()->json();
}

/**
 * @return array<string, mixed>
 */
function spendOverviewAt(mixed $test, string $query = ''): array
{
    return $test->getJson('/trail/api/overview'.($query === '' ? '' : '?'.$query))->assertOk()->json();
}

/**
 * @param  array<string, mixed>  $body
 * @return list<array<string, mixed>>
 */
function spendCumulatives(array $body): array
{
    return array_column($body['data']['series']['buckets'], 'cumulative');
}

/**
 * A day of usage for a 24h range read at 12:30, whose window is 06:00 to 12:00: steps of three at 06:00 (1),
 * 08:00 (2), 09:00 (1) and 11:00 (1), and a big step in the bucket the range cuts at its start and one in
 * the bucket in progress.
 */
function spendDay(): void
{
    spendRun('2026-01-01 12:40:00', [spendBigStep()]);
    spendRun('2026-01-02 06:10:00', [spendStep()]);
    spendRun('2026-01-02 08:20:00', [spendStep(), spendStep()]);
    spendRun('2026-01-02 09:30:00', [spendStep()]);
    spendRun('2026-01-02 11:45:00', [spendStep()]);
    spendRun('2026-01-02 12:10:00', [spendBigStep()]);
}

/**
 * @return list<string>
 */
function spendHours(string $first, int $count): array
{
    $from = CarbonImmutable::parse($first);

    return array_map(fn (int $hour) => $from->addHours($hour)->format('Y-m-d\TH:i:s.v\Z'), range(0, $count - 1));
}

describe('the recorded series', function () {
    it('is the overview\'s series, bucket by bucket, whatever the range', function (string $query) {
        Carbon::setTestNow('2026-01-02 12:00:00');
        UsageRows::dataset();
        spendRun('2026-01-02 11:20:00', [spendStep(), UsageRows::step('acme', 'mystery', ['inputTokens' => 9])]);
        spendRun('2026-01-02 11:41:00', [spendStep(['cost' => 0.125])], ['status' => Status::Failed]);
        spendRun('2026-01-02 11:58:00', [spendStep(['status' => Status::Running])], ['status' => Status::Running]);

        $spend = spendAt($this, $query)['data']['series'];
        $overview = spendOverviewAt($this, $query)['data']['series'];

        $bare = array_map(function (array $bucket) {
            unset($bucket['cumulative']);

            return $bucket;
        }, $spend['buckets']);

        expect($spend['buckets'])->not->toBeEmpty()
            ->and(array_unique(array_column(array_column($spend['buckets'], 'cost'), 'state')))->not->toBe(['not_captured'])
            ->and($spend['bucket'])->toBe($overview['bucket'])
            ->and($bare)->toBe($overview['buckets']);
    })->with([
        'the last hour' => ['range=1h'],
        'a day' => ['range=24h'],
        'a week' => ['range=7d'],
        'an explicit range' => ['from=2026-01-02T08:00:00Z&to=2026-01-02T12:00:00Z'],
        'an explicit range of days' => ['from=2025-12-25T00:00:00Z&to=2026-01-02T12:00:00Z'],
    ]);

    it('ends on the cost of the usage endpoint and of the overview, to the last digit', function (string $query) {
        Carbon::setTestNow('2026-01-02 12:00:00');
        UsageRows::dataset();

        $last = array_slice(spendCumulatives(spendAt($this, $query)), -1)[0];
        $usage = $this->getJson('/trail/api/usage?'.$query)->assertOk()->json('data.summary.cost');
        $overview = spendOverviewAt($this, $query)['data']['summary']['cost'];

        expect($last)->toBe($usage)->toBe($overview)
            ->and($last['amount'])->not->toBeNull();
    })->with([
        'the default range' => ['range=24h'],
        'a week' => ['range=7d'],
        'an explicit range' => ['from=2026-01-02T09:00:00Z&to=2026-01-02T11:00:00Z'],
    ]);

    it('holds the cost of the default range of the usage dataset', function () {
        Carbon::setTestNow('2026-01-02 12:00:00');
        UsageRows::dataset();

        // 0.0392 is the amount of the usage endpoint's own test for the same data; one run is running now.
        expect(array_slice(spendCumulatives(spendAt($this)), -1)[0])->toBe(['state' => 'pending', 'amount' => 0.0392]);
    });

    it('adds up what is recorded, bucket after bucket, and never restarts', function () {
        spendDay();

        $body = spendAt($this);
        $amounts = array_column(spendCumulatives($body), 'amount');

        // Buckets 0 (cut at the range start) to 17 hold the big step; 18 (06:00) is the first step of three.
        expect($body['data']['series']['buckets'])->toHaveCount(25)
            ->and($amounts)->toEqual([...array_fill(0, 18, 200.0), 203.0, 203.0, 209.0, 212.0, 212.0, 215.0, 415.0])
            ->and(array_unique(array_column(spendCumulatives($body), 'state')))->toBe(['estimated']);
    });

    it('moves through estimated, partial and pending, and is null until the first amount', function () {
        Carbon::setTestNow('2026-01-02 12:32:00');
        $unpriced = fn (int $input) => UsageRows::step('acme', 'mystery', ['inputTokens' => $input]);
        // 11:40 only an unpriced step; 11:50 a priced one; 12:00 both; 12:10 unpriced; 12:20 running; 12:25 priced.
        spendRun('2026-01-02 11:40:00', [$unpriced(10)]);
        spendRun('2026-01-02 11:50:00', [spendStep(['cost' => 0.5])]);
        spendRun('2026-01-02 12:00:00', [spendStep(['cost' => 0.25]), $unpriced(5)]);
        spendRun('2026-01-02 12:10:00', [$unpriced(7)]);
        spendRun('2026-01-02 12:20:00', [spendStep(['cost' => 0.1, 'status' => Status::Running])], ['status' => Status::Running]);
        spendRun('2026-01-02 12:25:00', [spendStep(['cost' => 1.0])]);

        $body = spendAt($this, 'range=1h');
        $none = ['state' => 'not_captured', 'amount' => null];
        $unpricedSoFar = ['state' => 'unpriced', 'amount' => null];

        expect($body['data']['series']['bucket'])->toBe('5m')
            ->and(array_column($body['data']['series']['buckets'], 'from'))->toHaveCount(13)
            ->and(spendCumulatives($body))->toBe([
                $none, $none, $unpricedSoFar, $unpricedSoFar,
                ['state' => 'partial', 'amount' => 0.5], ['state' => 'partial', 'amount' => 0.5],
                ['state' => 'partial', 'amount' => 0.75], ['state' => 'partial', 'amount' => 0.75],
                ['state' => 'partial', 'amount' => 0.75], ['state' => 'partial', 'amount' => 0.75],
                ['state' => 'pending', 'amount' => 0.85], ['state' => 'pending', 'amount' => 1.85],
                ['state' => 'pending', 'amount' => 1.85],
            ])
            ->and(array_column(array_column($body['data']['series']['buckets'], 'cost'), 'state'))->toBe([
                'not_captured', 'not_captured', 'unpriced', 'not_captured', 'estimated', 'not_captured',
                'partial', 'not_captured', 'unpriced', 'not_captured', 'pending', 'estimated', 'not_captured',
            ]);
    });
});

describe('the projection', function () {
    it('carries the rate of the last six complete hours over the next 24', function () {
        spendDay();

        $body = spendAt($this);
        $projection = $body['data']['projection'];

        expect($projection['state'])->toBe('projected')
            ->and($projection['window'])->toBe(['from' => '2026-01-02T06:00:00.000Z', 'to' => '2026-01-02T12:00:00.000Z', 'buckets' => 6, 'with_usage' => 4])
            // Fifteen in six hours: 2.5 an hour, whatever the idle hours. Dividing by the four busy ones gives 3.75.
            ->and($projection['per_bucket'])->toBe(2.5)
            ->and($projection['total'])->toBe(60)
            ->and($projection['left_out'])->toBe(['unpriced_steps' => 0, 'unpriced_tokens' => 0, 'unfinished_runs' => 0])
            ->and($projection['buckets'])->toHaveCount(24)
            ->and(array_column($projection['buckets'], 'from'))->toBe(spendHours('2026-01-02T13:00:00Z', 24))
            ->and(array_column($projection['buckets'], 'to'))->toBe(spendHours('2026-01-02T14:00:00Z', 24))
            ->and(array_unique(array_column($projection['buckets'], 'amount')))->toBe([2.5])
            ->and($projection['buckets'][0]['cumulative'])->toBe(417.5)
            ->and($projection['buckets'][23]['cumulative'])->toBe(475)
            ->and(array_column($projection['buckets'], 'cumulative'))->toEqual(array_map(fn (int $hour) => 415.0 + 2.5 * $hour, range(1, 24)))
            // It continues from the recorded line and is not part of it.
            ->and(spendCumulatives($body)[24])->toBe(['state' => 'estimated', 'amount' => 415])
            ->and($body['range'])->toBe(['preset' => '24h', 'from' => '2026-01-01T12:30:00.000Z', 'to' => '2026-01-02T12:30:00.000Z']);
    });

    it('starts where the series ends when the clock is on an edge', function () {
        Carbon::setTestNow('2026-01-02 12:00:00');
        spendRun('2026-01-02 06:10:00', [spendStep()]);
        spendRun('2026-01-02 08:20:00', [spendStep()]);
        spendRun('2026-01-02 11:45:00', [spendStep()]);

        $body = spendAt($this);
        $projection = $body['data']['projection'];

        // Nothing is in progress: the last bucket is 11:00 to 12:00, and the first projected one begins at 12:00.
        expect(array_column($body['data']['series']['buckets'], 'in_progress'))->not->toContain(true)
            ->and($projection['window']['to'])->toBe('2026-01-02T12:00:00.000Z')
            ->and($projection['window']['from'])->toBe('2026-01-02T06:00:00.000Z')
            ->and($projection['per_bucket'])->toBe(1.5)
            ->and($projection['buckets'][0]['from'])->toBe('2026-01-02T12:00:00.000Z')
            ->and($projection['buckets'][23]['to'])->toBe('2026-01-03T12:00:00.000Z');
    });

    it('carries five-minute buckets over the next twelve for the last hour', function () {
        Carbon::setTestNow('2026-01-02 12:32:00');
        spendRun('2026-01-02 11:33:00', [spendBigStep()]);
        spendRun('2026-01-02 12:01:00', [spendStep()]);
        spendRun('2026-01-02 12:12:00', [spendStep()]);
        spendRun('2026-01-02 12:21:00', [spendStep()]);
        spendRun('2026-01-02 12:26:00', [spendStep()]);
        spendRun('2026-01-02 12:31:00', [spendBigStep()]);

        $body = spendAt($this, 'range=1h');
        $projection = $body['data']['projection'];
        $starts = ['12:35', '12:40', '12:45', '12:50', '12:55', '13:00', '13:05', '13:10', '13:15', '13:20', '13:25', '13:30'];
        $ends = ['12:40', '12:45', '12:50', '12:55', '13:00', '13:05', '13:10', '13:15', '13:20', '13:25', '13:30', '13:35'];

        expect($body['data']['series']['bucket'])->toBe('5m')
            ->and($body['data']['series']['buckets'])->toHaveCount(13)
            ->and($projection['window'])->toBe(['from' => '2026-01-02T12:00:00.000Z', 'to' => '2026-01-02T12:30:00.000Z', 'buckets' => 6, 'with_usage' => 4])
            ->and($projection['per_bucket'])->toBe(2)
            ->and($projection['total'])->toBe(24)
            ->and(array_column($projection['buckets'], 'from'))->toBe(array_map(fn (string $time) => "2026-01-02T{$time}:00.000Z", $starts))
            ->and(array_column($projection['buckets'], 'to'))->toBe(array_map(fn (string $time) => "2026-01-02T{$time}:00.000Z", $ends))
            ->and(array_unique(array_column($projection['buckets'], 'amount')))->toBe([2])
            // The recorded line ends at 412: 200 and 200 for the big steps, 12 for the four of three.
            ->and(spendCumulatives($body)[12])->toBe(['state' => 'estimated', 'amount' => 412])
            ->and(array_column($projection['buckets'], 'cumulative'))->toBe(array_map(fn (int $bucket) => 412 + 2 * $bucket, range(1, 12)));
    });

    it('carries days over the next seven for the last week', function () {
        Carbon::setTestNow('2026-01-08 12:00:00');
        spendRun('2026-01-01 13:00:00', [spendBigStep()]);
        spendRun('2026-01-02 10:00:00', [spendStep()]);
        spendRun('2026-01-03 10:00:00', [spendStep(), spendStep()]);
        spendRun('2026-01-05 10:00:00', [spendStep()]);
        spendRun('2026-01-06 10:00:00', [spendStep()]);
        spendRun('2026-01-07 10:00:00', [spendStep(), spendStep()]);
        spendRun('2026-01-08 06:00:00', [spendBigStep()]);

        $body = spendAt($this, 'range=7d');
        $projection = $body['data']['projection'];

        expect($body['data']['series']['bucket'])->toBe('day')
            ->and($body['data']['series']['buckets'])->toHaveCount(8)
            ->and($projection['window'])->toBe(['from' => '2026-01-02T00:00:00.000Z', 'to' => '2026-01-08T00:00:00.000Z', 'buckets' => 6, 'with_usage' => 5])
            // 3 + 6 + 0 + 3 + 3 + 6 over six days.
            ->and($projection['per_bucket'])->toBe(3.5)
            ->and($projection['total'])->toBe(24.5)
            ->and(array_column($projection['buckets'], 'from'))->toBe(['2026-01-09T00:00:00.000Z', '2026-01-10T00:00:00.000Z', '2026-01-11T00:00:00.000Z', '2026-01-12T00:00:00.000Z', '2026-01-13T00:00:00.000Z', '2026-01-14T00:00:00.000Z', '2026-01-15T00:00:00.000Z'])
            ->and(array_column($projection['buckets'], 'to'))->toBe(['2026-01-10T00:00:00.000Z', '2026-01-11T00:00:00.000Z', '2026-01-12T00:00:00.000Z', '2026-01-13T00:00:00.000Z', '2026-01-14T00:00:00.000Z', '2026-01-15T00:00:00.000Z', '2026-01-16T00:00:00.000Z'])
            ->and(spendCumulatives($body)[7])->toBe(['state' => 'estimated', 'amount' => 421])
            ->and(array_column($projection['buckets'], 'cumulative'))->toEqual([424.5, 428.0, 431.5, 435.0, 438.5, 442.0, 445.5]);
    });

    it('needs three of the six hours to have recorded usage', function () {
        spendRun('2026-01-02 06:10:00', [spendStep()]);
        spendRun('2026-01-02 08:20:00', [spendStep()]);

        $two = spendAt($this)['data']['projection'];

        expect($two['state'])->toBe('not_enough_history')
            ->and($two['window'])->toBe(['from' => '2026-01-02T06:00:00.000Z', 'to' => '2026-01-02T12:00:00.000Z', 'buckets' => 6, 'with_usage' => 2])
            ->and($two['per_bucket'])->toBeNull()
            ->and($two['total'])->toBeNull()
            ->and($two['buckets'])->toBe([]);

        spendRun('2026-01-02 09:30:00', [spendStep()]);

        $three = spendAt($this)['data']['projection'];

        // Nine over six hours, not over the three that had usage.
        expect($three['state'])->toBe('projected')
            ->and($three['window']['with_usage'])->toBe(3)
            ->and($three['per_bucket'])->toBe(1.5)
            ->and($three['total'])->toBe(36)
            ->and($three['buckets'])->toHaveCount(24);
    });

    it('leaves out the bucket in progress and the bucket cut by the start of the range', function () {
        spendRun('2026-01-02 06:10:00', [spendStep()]);
        spendRun('2026-01-02 08:20:00', [spendStep()]);
        spendRun('2026-01-02 09:30:00', [spendStep()]);

        $before = spendAt($this)['data']['projection'];

        spendRun('2026-01-01 12:40:00', [spendBigStep()]);
        spendRun('2026-01-02 12:10:00', [spendBigStep()]);

        $after = spendAt($this);

        expect($before['per_bucket'])->toBe(1.5)
            ->and($after['data']['projection']['per_bucket'])->toBe(1.5)
            ->and($after['data']['projection']['window'])->toBe($before['window'])
            ->and($after['data']['projection']['left_out'])->toBe($before['left_out'])
            ->and(array_slice(spendCumulatives($after), -1)[0]['amount'])->toBe(409);
    });

    it('takes the last complete buckets of a series, never one in progress or cut', function () {
        $figures = RunFigures::empty();
        $bucket = fn (int $hour, bool $full, bool $inProgress) => new OverviewBucket(
            CarbonImmutable::parse('2026-01-02T00:00:00Z')->addHours($hour),
            CarbonImmutable::parse('2026-01-02T01:00:00Z')->addHours($hour),
            $full,
            $inProgress,
            $figures,
        );
        $starts = fn (array $window) => array_map(fn (OverviewBucket $bucket) => $bucket->from->format('H'), $window);

        // Cut at the start, seven full ones, the last of them in progress: six complete ones remain.
        $series = [$bucket(0, false, false), ...array_map(fn (int $hour) => $bucket($hour, true, false), range(1, 6)), $bucket(7, true, true)];
        // A cut bucket that is not in progress, a full one in progress, and one full bucket.
        $short = [$bucket(0, false, false), $bucket(1, true, false), $bucket(2, false, false), $bucket(3, true, true)];

        expect($starts(SpendQuery::window($series)))->toBe(['01', '02', '03', '04', '05', '06'])
            ->and($starts(SpendQuery::window($series, 3)))->toBe(['04', '05', '06'])
            ->and($starts(SpendQuery::window($short)))->toBe(['01'])
            ->and(SpendQuery::window([]))->toBe([]);
    });
});

describe('what the rate leaves out', function () {
    it('counts the unpriced, the unfinished and the unidentified, and reads a stale run as over', function () {
        spendRun('2026-01-02 06:10:00', [spendStep()]);
        spendRun('2026-01-02 07:10:00', [spendStep()]);
        // Running now: its usage is not in the rate, and the run is counted.
        spendRun('2026-01-02 07:40:00', [spendStep(['status' => Status::Running])], ['status' => Status::Running]);
        spendRun('2026-01-02 08:10:00', [spendStep()]);
        spendRun('2026-01-02 09:10:00', [
            spendStep(['inputTokens' => 400, 'outputTokens' => 100, 'cost' => null], 'mystery'),
            spendStep(['inputTokens' => 200, 'outputTokens' => null, 'cost' => null], 'mystery'),
            UsageRows::step(null, null, ['inputTokens' => 300, 'outputTokens' => 20]),
            UsageRows::step('acme', null, ['inputTokens' => 100]),
        ]);
        spendRun('2026-01-02 10:10:00', [
            // Cache read tokens and no cache read rate.
            spendStep(['inputTokens' => 1000, 'outputTokens' => 50, 'cacheReadTokens' => 100, 'cost' => null], 'plain'),
            spendStep(['inputTokens' => 5000, 'outputTokens' => 500, 'cost' => 0.0], 'free'),
            UsageRows::embedding('acme', 'embed', ['inputTokens' => 2_000_000, 'cost' => 0.2]),
        ]);
        // Left running for longer than stale_after (an hour before the clock): over, so priced.
        spendRun('2026-01-02 11:10:00', [spendStep(['status' => Status::Running])], ['status' => Status::Running], storedAt: '2026-01-02 09:00:00');

        $projection = spendAt($this)['data']['projection'];

        // 3 + 3 + 3 + 0 + 0.2 + 3 over six hours.
        expect($projection['state'])->toBe('projected')
            ->and($projection['window']['with_usage'])->toBe(6)
            ->and($projection['per_bucket'])->toBe(2.0333333333)
            ->and($projection['total'])->toBe(48.7999999992)
            // The two steps of mystery and the two without a name, and the step of plain; 700 + 320 + 100 + 1050.
            ->and($projection['left_out'])->toBe(['unpriced_steps' => 5, 'unpriced_tokens' => 2170, 'unfinished_runs' => 1]);
    });

    it('prices a group whole or leaves it out whole', function (array $steps, int $withUsage, ?float $perBucket, int $unpricedSteps, ?int $unpricedTokens) {
        spendRun('2026-01-02 06:10:00', [spendStep()]);
        spendRun('2026-01-02 07:10:00', [spendStep()]);
        spendRun('2026-01-02 08:10:00', [spendStep()]);
        spendRun('2026-01-02 09:10:00', $steps);

        $projection = spendAt($this)['data']['projection'];

        expect($projection['state'])->toBe('projected')
            ->and($projection['window']['with_usage'])->toBe($withUsage)
            ->and($projection['per_bucket'])->toBe($perBucket)
            ->and($projection['left_out'])->toBe(['unpriced_steps' => $unpricedSteps, 'unpriced_tokens' => $unpricedTokens, 'unfinished_runs' => 0]);
    })->with([
        'no output reported, and the model charges for output' => [[spendStep(['outputTokens' => null, 'cost' => null])], 4, 1.5, 1, 1_000_000],
        'no input reported' => [[spendStep(['inputTokens' => null, 'cost' => null])], 4, 1.5, 1, 100_000],
        'only cache tokens reported' => [[UsageRows::step('acme', 'alpha', ['cacheReadTokens' => 5])], 4, 1.5, 1, null],
        'no output rate and no output reported' => [[UsageRows::embedding('acme', 'embed', ['inputTokens' => 2_000_000])], 4, 1.5333333333, 0, 0],
        'a rate of zero' => [[spendStep(['inputTokens' => 5000, 'outputTokens' => 500], 'free')], 4, 1.5, 0, 0],
        'cache tokens without a rate for them' => [[spendStep(['inputTokens' => 1000, 'outputTokens' => 50, 'cacheReadTokens' => 100], 'plain')], 4, 1.5, 1, 1050],
        'cache tokens at their own rates' => [[spendStep(['inputTokens' => 1_000_000, 'cacheReadTokens' => 400_000, 'cacheWriteTokens' => 100_000])], 4, 1.9333333333, 0, 0],
        'a step that reported nothing' => [[UsageRows::step('acme', 'alpha')], 3, 1.5, 0, 0],
        'tokens reported as zero' => [[spendStep(['inputTokens' => 0, 'outputTokens' => 0])], 4, 1.5, 0, 0],
    ]);

    it('is not enough history when nothing in the window could be priced', function () {
        foreach (['06:10', '07:10', '08:10'] as $time) {
            spendRun("2026-01-02 {$time}:00", [UsageRows::step('acme', 'mystery', ['inputTokens' => 100, 'outputTokens' => 10])]);
        }

        $projection = spendAt($this)['data']['projection'];

        expect($projection['state'])->toBe('not_enough_history')
            ->and($projection['window']['with_usage'])->toBe(3)
            ->and($projection['per_bucket'])->toBe(null)
            ->and($projection['total'])->toBeNull()
            ->and($projection['buckets'])->toBe([])
            ->and($projection['left_out'])->toBe(['unpriced_steps' => 3, 'unpriced_tokens' => 330, 'unfinished_runs' => 0]);
    });

    it('does not count the usage of runs still running as history', function () {
        foreach (['06:10', '07:10', '08:10'] as $time) {
            spendRun("2026-01-02 {$time}:00", [spendStep(['status' => Status::Running])], ['status' => Status::Running]);
        }
        spendRun('2026-01-02 09:10:00', [spendStep()]);

        $projection = spendAt($this)['data']['projection'];

        expect($projection['state'])->toBe('not_enough_history')
            ->and($projection['window']['with_usage'])->toBe(1)
            ->and($projection['left_out'])->toBe(['unpriced_steps' => 0, 'unpriced_tokens' => 0, 'unfinished_runs' => 3]);
    });
});

describe('prices', function () {
    it('follows a saved price at once while the recorded series stays as it was', function () {
        spendDay();
        // This process has resolved prices, and holds them for a minute.
        expect(app(PriceBook::class)->rateFor('acme', 'alpha')?->input)->toBe(2.0);

        $before = spendAt($this);

        DB::table('trail_prices')->insert(['provider' => 'acme', 'model' => 'alpha', 'input' => 4, 'output' => 20, 'created_at' => '2026-01-02 12:00:00.000', 'updated_at' => '2026-01-02 12:00:00.000']);

        $after = spendAt($this);

        expect($before['data']['projection']['per_bucket'])->toBe(2.5)
            ->and($after['data']['projection']['per_bucket'])->toBe(5)
            ->and($after['data']['projection']['total'])->toBe(120)
            ->and(array_unique(array_column($after['data']['projection']['buckets'], 'amount')))->toBe([5])
            ->and(array_column($after['data']['projection']['buckets'], 'cumulative'))->toEqual(array_map(fn (int $hour) => 415.0 + 5.0 * $hour, range(1, 24)))
            ->and(json_encode($after['data']['series']))->toBe(json_encode($before['data']['series']));
    });

    it('follows a price saved and reset through the API', function () {
        // The writes are checked for a token and for access outside the local environment.
        $this->app['env'] = 'testing';
        Trail::auth(fn () => true);
        spendDay();
        app(PriceBook::class)->rateFor('acme', 'alpha');
        $series = json_encode(spendAt($this)['data']['series']);

        $this->putJson('/trail/api/prices?provider=acme&model=alpha', ['input' => 4, 'output' => 20])->assertOk();
        $saved = spendAt($this);

        $this->deleteJson('/trail/api/prices?provider=acme&model=alpha')->assertOk();
        $reset = spendAt($this);

        expect($saved['data']['projection']['per_bucket'])->toBe(5)
            ->and($saved['data']['projection']['total'])->toBe(120)
            ->and($reset['data']['projection']['per_bucket'])->toBe(2.5)
            ->and(json_encode($saved['data']['series']))->toBe($series)
            ->and(json_encode($reset['data']['series']))->toBe($series);
    });

    it('leaves a model out when a saved price takes its rate away', function () {
        spendDay();
        app(PriceBook::class)->rateFor('acme', 'alpha');

        // Saved with no output rate: the output tokens of the steps have none, so every group is left out.
        DB::table('trail_prices')->insert(['provider' => 'acme', 'model' => 'alpha', 'input' => 4, 'created_at' => '2026-01-02 12:00:00.000', 'updated_at' => '2026-01-02 12:00:00.000']);

        $projection = spendAt($this)['data']['projection'];

        // Each of the five steps used 100,000 output tokens, which the saved price has no rate for.
        expect($projection['state'])->toBe('not_enough_history')
            ->and($projection['per_bucket'])->toBeNull()
            ->and($projection['left_out'])->toBe(['unpriced_steps' => 5, 'unpriced_tokens' => 5_500_000, 'unfinished_runs' => 0]);
    });
});

describe('a range that is not current', function () {
    it('is never projected, whatever its end', function (string $query) {
        spendDay();

        $body = spendAt($this, $query);
        $series = spendOverviewAt($this, $query)['data']['series'];

        expect($body['data']['projection'])->toBe([
            'state' => 'range_not_current',
            'window' => null,
            'per_bucket' => null,
            'total' => null,
            'buckets' => [],
            'left_out' => ['unpriced_steps' => 0, 'unpriced_tokens' => 0, 'unfinished_runs' => 0],
        ])->and($body['range']['preset'])->toBeNull()
            ->and($body['data']['series']['bucket'])->toBe($series['bucket'])
            ->and($body['data']['series']['buckets'])->not->toBeEmpty();
    })->with([
        'in the past' => ['from=2026-01-02T00:00:00Z&to=2026-01-02T06:00:00Z'],
        'ending at the current instant' => ['from=2026-01-01T12:30:00Z&to=2026-01-02T12:30:00Z'],
        'ending in the future' => ['from=2026-01-01T12:30:00Z&to=2026-01-02T18:30:00Z'],
    ]);

    it('reads what the overview reads and nothing more', function () {
        spendDay();
        $query = 'from=2026-01-01T12:30:00Z&to=2026-01-02T12:30:00Z';

        $spend = AgentRows::statements(fn () => spendAt($this, $query));
        $overview = AgentRows::statements(fn () => spendOverviewAt($this, $query));

        expect($overview)->toHaveCount(1)
            ->and($spend)->toBe($overview);
    });
});

describe('the number of reads', function () {
    it('is the overview\'s, one read of the window\'s tokens and one of the saved prices', function () {
        spendDay();

        $overview = AgentRows::statements(fn () => spendOverviewAt($this));
        $spend = AgentRows::statements(fn () => spendAt($this));

        expect($overview)->toHaveCount(1)
            ->and($spend)->toHaveCount(3)
            ->and(array_slice($spend, 0, 1))->toBe($overview)
            ->and(array_filter($spend, fn (string $sql) => str_contains($sql, 'trail_trace_models')))->toHaveCount(1)
            ->and(array_filter($spend, fn (string $sql) => str_contains($sql, 'trail_prices')))->toHaveCount(1);
    });

    it('does not read prices when the window holds no usage', function () {
        $statements = AgentRows::statements(fn () => spendAt($this));

        expect($statements)->toHaveCount(2)
            ->and(array_filter($statements, fn (string $sql) => str_contains($sql, 'trail_prices')))->toBe([]);
    });

    it('reads once more however long the range', function (string $query) {
        spendDay();

        expect(AgentRows::statements(fn () => spendAt($this, $query)))->toHaveCount(3);
    })->with(['range=1h', 'range=24h', 'range=7d']);
});

describe('few buckets', function () {
    it('has a window of fewer than six when a repeated hour makes the series one bucket', function () {
        config(['app.timezone' => 'America/New_York']);
        // 01:50 EST: the last hour is 01:50 EDT to 01:50 EST, stored as the same times twice, so one bucket.
        Carbon::setTestNow(Carbon::parse('2026-11-01T06:50:00Z'));
        // Runs are counted by their stored times, and both bounds of the range are the stored time 01:50: the range holds none.
        spendRun('2026-11-01T05:55:00Z', [spendStep()]);

        $statements = AgentRows::statements(function () use (&$body) {
            $body = spendAt($this, 'range=1h');
        });

        expect($body['data']['series']['buckets'])->toHaveCount(1)
            ->and($body['data']['series']['buckets'][0])->toMatchArray(['from' => '2026-11-01T05:50:00.000Z', 'to' => '2026-11-01T06:50:00.000Z', 'full' => true, 'in_progress' => false])
            ->and($body['data']['series']['buckets'][0]['runs']['all'])->toBe(0)
            ->and($body['data']['projection']['state'])->toBe('not_enough_history')
            ->and($body['data']['projection']['window'])->toBe(['from' => '2026-11-01T05:50:00.000Z', 'to' => '2026-11-01T06:50:00.000Z', 'buckets' => 1, 'with_usage' => 0])
            ->and($body['data']['projection']['per_bucket'])->toBeNull()
            ->and($body['data']['projection']['buckets'])->toBe([])
            // The overview's read and the window's tokens.
            ->and($statements)->toHaveCount(2);
    });

    it('has no window at all when the only bucket is in progress', function () {
        config(['app.timezone' => 'America/New_York']);
        Carbon::setTestNow(Carbon::parse('2026-11-01T06:52:00Z'));
        spendRun('2026-11-01T05:55:00Z', [spendStep()]);

        $statements = AgentRows::statements(function () use (&$body) {
            $body = spendAt($this, 'range=1h');
        });

        expect($body['data']['series']['buckets'])->toHaveCount(1)
            ->and($body['data']['series']['buckets'][0])->toMatchArray(['full' => false, 'in_progress' => true])
            ->and($body['data']['projection'])->toBe([
                'state' => 'not_enough_history',
                'window' => null,
                'per_bucket' => null,
                'total' => null,
                'buckets' => [],
                'left_out' => ['unpriced_steps' => 0, 'unpriced_tokens' => 0, 'unfinished_runs' => 0],
            ])
            ->and($statements)->toHaveCount(1);
    });
});

describe('a clock change', function () {
    beforeEach(fn () => config(['app.timezone' => 'America/New_York']));

    it('makes one bucket of the repeated hour in the window, with the runs of both passes', function () {
        Carbon::setTestNow(Carbon::parse('2026-11-01T09:30:00Z'));
        // 22:30 EDT, 23:30 EDT, both 01:30s, and 02:30 EST.
        foreach (['02:30', '03:30', '05:30', '06:30', '07:30'] as $time) {
            spendRun("2026-11-01T{$time}:00Z", [spendStep()]);
        }

        $body = spendAt($this);
        $buckets = $body['data']['series']['buckets'];
        $projection = $body['data']['projection'];
        $merged = array_values(array_filter($buckets, fn (array $bucket) => $bucket['from'] === '2026-11-01T05:00:00.000Z'));

        expect($merged)->toHaveCount(1)
            ->and($merged[0]['to'])->toBe('2026-11-01T07:00:00.000Z')
            ->and($merged[0]['runs']['all'])->toBe(2)
            ->and($buckets[count($buckets) - 1])->toMatchArray(['from' => '2026-11-01T09:00:00.000Z', 'to' => '2026-11-01T09:30:00.000Z', 'in_progress' => true])
            ->and($projection['window'])->toBe(['from' => '2026-11-01T02:00:00.000Z', 'to' => '2026-11-01T09:00:00.000Z', 'buckets' => 6, 'with_usage' => 4])
            // Fifteen over six buckets, the repeated hour one of them with two runs in it.
            ->and($projection['per_bucket'])->toBe(2.5)
            ->and($projection['total'])->toBe(60)
            ->and(array_column($projection['buckets'], 'from'))->toBe(spendHours('2026-11-01T10:00:00Z', 24))
            ->and(array_column($projection['buckets'], 'cumulative'))->toEqual(array_map(fn (int $hour) => 15.0 + 2.5 * $hour, range(1, 24)));
    });

    it('makes one bucket of the repeated hour among the projected ones', function () {
        Carbon::setTestNow(Carbon::parse('2026-11-01T02:30:00Z'));
        foreach (['2026-10-31T20:30:00Z', '2026-10-31T22:30:00Z', '2026-11-01T00:30:00Z', '2026-11-01T01:30:00Z'] as $started) {
            spendRun($started, [spendStep()]);
        }

        $body = spendAt($this);
        $projection = $body['data']['projection'];

        expect($projection['window'])->toBe(['from' => '2026-10-31T20:00:00.000Z', 'to' => '2026-11-01T02:00:00.000Z', 'buckets' => 6, 'with_usage' => 4])
            ->and($projection['per_bucket'])->toBe(2)
            ->and($projection['total'])->toBe(48)
            ->and($projection['buckets'])->toHaveCount(24)
            ->and(array_slice(array_column($projection['buckets'], 'from'), 0, 5))->toBe(['2026-11-01T03:00:00.000Z', '2026-11-01T04:00:00.000Z', '2026-11-01T05:00:00.000Z', '2026-11-01T07:00:00.000Z', '2026-11-01T08:00:00.000Z'])
            ->and(array_slice(array_column($projection['buckets'], 'to'), 0, 5))->toBe(['2026-11-01T04:00:00.000Z', '2026-11-01T05:00:00.000Z', '2026-11-01T07:00:00.000Z', '2026-11-01T08:00:00.000Z', '2026-11-01T09:00:00.000Z'])
            ->and($projection['buckets'][23])->toMatchArray(['from' => '2026-11-02T03:00:00.000Z', 'to' => '2026-11-02T04:00:00.000Z'])
            // The repeated hour is one bucket: it is the third, and each has a step of the same amount.
            ->and(array_column($projection['buckets'], 'cumulative'))->toBe(array_map(fn (int $bucket) => 12 + 2 * $bucket, range(1, 24)));
    });

    it('makes a day of 23 hours among the projected ones', function () {
        Carbon::setTestNow(Carbon::parse('2026-03-06T12:00:00Z'));
        foreach (['2026-03-01T15:00:00Z', '2026-03-03T15:00:00Z', '2026-03-05T15:00:00Z'] as $started) {
            spendRun($started, [spendStep()]);
        }

        $projection = spendAt($this, 'range=7d')['data']['projection'];

        // Days of New York: 7 March from 05:00Z, 8 March (23 hours, the clock goes forward) from 05:00Z, then from 04:00Z.
        expect($projection['window'])->toBe(['from' => '2026-02-28T05:00:00.000Z', 'to' => '2026-03-06T05:00:00.000Z', 'buckets' => 6, 'with_usage' => 3])
            ->and($projection['per_bucket'])->toBe(1.5)
            ->and($projection['total'])->toBe(10.5)
            ->and(array_column($projection['buckets'], 'from'))->toBe([
                '2026-03-07T05:00:00.000Z', '2026-03-08T05:00:00.000Z', '2026-03-09T04:00:00.000Z', '2026-03-10T04:00:00.000Z',
                '2026-03-11T04:00:00.000Z', '2026-03-12T04:00:00.000Z', '2026-03-13T04:00:00.000Z',
            ])
            ->and(array_column($projection['buckets'], 'to'))->toBe([
                '2026-03-08T05:00:00.000Z', '2026-03-09T04:00:00.000Z', '2026-03-10T04:00:00.000Z', '2026-03-11T04:00:00.000Z',
                '2026-03-12T04:00:00.000Z', '2026-03-13T04:00:00.000Z', '2026-03-14T04:00:00.000Z',
            ])
            ->and(array_column($projection['buckets'], 'cumulative'))->toEqual([10.5, 12.0, 13.5, 15.0, 16.5, 18.0, 19.5]);
    });
});

describe('an empty database', function () {
    it('has a series of nothing recorded and nothing to project from', function () {
        $body = spendAt($this);
        $buckets = $body['data']['series']['buckets'];

        expect($buckets)->toHaveCount(25)
            ->and(array_unique(array_column($buckets, 'cumulative'), SORT_REGULAR))->toBe([['state' => 'not_captured', 'amount' => null]])
            ->and(array_unique(array_column($buckets, 'cost'), SORT_REGULAR))->toBe([['state' => 'not_captured', 'amount' => null]])
            ->and($body['data']['projection'])->toBe([
                'state' => 'not_enough_history',
                'window' => ['from' => '2026-01-02T06:00:00.000Z', 'to' => '2026-01-02T12:00:00.000Z', 'buckets' => 6, 'with_usage' => 0],
                'per_bucket' => null,
                'total' => null,
                'buckets' => [],
                'left_out' => ['unpriced_steps' => 0, 'unpriced_tokens' => 0, 'unfinished_runs' => 0],
            ]);
    });
});

describe('errors', function () {
    it('answers the 422 of the overview for a range over 92 days', function () {
        $spend = $this->getJson('/trail/api/usage/spend?from=2025-01-01T00:00:00Z&to=2026-01-02T00:00:00Z');
        $overview = $this->getJson('/trail/api/overview?from=2025-01-01T00:00:00Z&to=2026-01-02T00:00:00Z');

        $spend->assertUnprocessable()->assertJsonValidationErrors(['from']);

        expect($spend->json())->toBe($overview->json())
            ->and($spend->json('errors.from'))->toBe(['The range is too long: at most 92 days.']);
    });

    it('answers a 422 for a bad range', function (string $query, string $field) {
        $this->getJson('/trail/api/usage/spend?'.$query)->assertUnprocessable()->assertJsonValidationErrors([$field]);
    })->with([
        ['range=bad', 'range'],
        ['range=24h&from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z', 'range'],
        ['to=2026-01-02T00:00:00Z', 'from'],
        ['from=2026-01-02T00:00:00Z&to=2026-01-01T00:00:00Z', 'from'],
        ['from=yesterday&to=today', 'from'],
    ]);

    it('ignores every other parameter', function () {
        spendDay();

        expect(spendAt($this, 'by=bad&sort=bad&page=0&per_page=ten'))->toBe(spendAt($this));
    });
});

describe('access', function () {
    it('answers a denied request with a JSON 403', function () {
        $this->app['env'] = 'production';

        $this->get('/trail/api/usage/spend', ['Accept' => 'text/html'])->assertForbidden()->assertJsonStructure(['message']);

        Trail::auth(fn () => true);
        $this->get('/trail/api/usage/spend', ['Accept' => 'text/html'])->assertOk();

        Trail::auth(fn () => false);
        $this->get('/trail/api/usage/spend', ['Accept' => 'text/html'])->assertForbidden();
    });

    it('answers a JSON 404 when the dashboard is switched off', function () {
        config(['trail.dashboard.enabled' => false]);

        $this->get('/trail/api/usage/spend', ['Accept' => 'text/html'])->assertNotFound()->assertJsonStructure(['message']);
    });

    it('answers a JSON 422 for a bad range even when HTML is asked for', function () {
        $this->get('/trail/api/usage/spend?range=bad', ['Accept' => 'text/html'])->assertUnprocessable()->assertJsonValidationErrors(['range']);
    });
});
