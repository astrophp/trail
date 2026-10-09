<?php

namespace Astro\Trail\Queries;

use Astro\Trail\Enums\Status;
use Astro\Trail\Pricing\PriceBook;
use Astro\Trail\Pricing\Rate;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Storage\StaleRuns;
use Carbon\CarbonImmutable;
use Illuminate\Validation\ValidationException;

/**
 * The series of the overview and, beside it, a simple projection: the estimated cost per bucket of
 * the last complete buckets, at the prices as they are now, carried over the buckets that follow.
 *
 * The rate is one grouped read of the tokens of those buckets by provider and model, priced here
 * with the formula of the cost calculator, so that it follows a price change at once while the
 * series, which was frozen when each run was stored, does not.
 */
final class SpendQuery
{
    /** How many complete buckets the rate is taken from. */
    public const WINDOW = 6;

    /** How many of them must have recorded usage for a rate to be worth projecting. */
    public const MINIMUM_WITH_USAGE = 3;

    /** @var array<string, int> unit => how many buckets are projected */
    public const AHEAD = ['5m' => 12, 'hour' => 24, 'day' => 7];

    private const MILLION = 1_000_000;

    public function __construct(
        private readonly OverviewQuery $overview,
        private readonly PriceBook $prices,
    ) {}

    /**
     * @throws ValidationException when the range is too long to be cut into buckets
     */
    public function read(TimeRange $range): Spend
    {
        $overview = $this->overview->read($range, RunScope::none());

        return new Spend(
            $overview->unit,
            $overview->buckets,
            $range->preset === null ? SpendProjection::notCurrent() : $this->project($range, $overview),
        );
    }

    /**
     * The last complete buckets of a series, oldest first: those wholly inside the range and over,
     * counted back from the newest. The bucket in progress and a bucket cut by the range never are.
     *
     * @param  list<OverviewBucket>  $buckets
     * @return list<OverviewBucket>
     */
    public static function window(array $buckets, int $size = self::WINDOW): array
    {
        $complete = array_values(array_filter($buckets, fn (OverviewBucket $bucket) => $bucket->full && ! $bucket->inProgress));

        return array_slice($complete, -$size);
    }

    private function project(TimeRange $range, Overview $overview): SpendProjection
    {
        $window = self::window($overview->buckets);

        if ($window === []) {
            return new SpendProjection(ProjectionState::NotEnoughHistory, null, null, [], 0, 0, 0);
        }

        $rate = $this->rate($window);
        $unfinished = array_sum(array_map(fn (OverviewBucket $bucket) => $bucket->figures->runs['running'], $window));
        $projected = $rate['withUsage'] >= self::MINIMUM_WITH_USAGE && $rate['priced'];

        return new SpendProjection(
            state: $projected ? ProjectionState::Projected : ProjectionState::NotEnoughHistory,
            window: new SpendWindow($window[0]->from, $window[count($window) - 1]->to, count($window), $rate['withUsage']),
            perBucket: $projected ? round($rate['amount'] / count($window), RunFigures::PLACES) : null,
            ahead: $projected ? $this->ahead($overview->unit, $range) : [],
            unpricedSteps: $rate['unpricedSteps'],
            unpricedTokens: $rate['unpricedTokens'],
            unfinishedRuns: $unfinished,
        );
    }

    /**
     * The clock buckets that follow the series: from where its last bucket ends, as many as the unit
     * projects, cut along the clock as the series is.
     *
     * @return list<array{from: CarbonImmutable, to: CarbonImmutable}>
     */
    private function ahead(BucketUnit $unit, TimeRange $range): array
    {
        $series = $unit->buckets($range);
        $start = $series[count($series) - 1]['end'];
        $count = self::AHEAD[$unit->value];

        // Room for the count and for a repeated hour that makes one bucket of two.
        $end = match ($unit) {
            BucketUnit::FiveMinutes => $start->addMinutes(($count + 12) * 5),
            BucketUnit::Hour => $start->addHours($count + 3),
            BucketUnit::Day => $start->addDays($count + 3),
        };

        return array_map(
            fn (array $bucket) => ['from' => $bucket['from'], 'to' => $bucket['to']],
            array_slice($unit->buckets(new TimeRange(null, $start, $end)), 0, $count),
        );
    }

    /**
     * The estimated cost, at the prices of now, of the usage the window recorded, and what it left out.
     *
     * Runs still running (by the stale rule) are not read. A group of provider and model is priced
     * whole or left out whole: as the cost calculator leaves a step out when its input is missing,
     * when the model has no rate, when it charges for output and none was reported, or when a part
     * that used tokens has no rate.
     *
     * @param  list<OverviewBucket>  $window
     * @return array{amount: float, priced: bool, withUsage: int, unpricedSteps: int, unpricedTokens: ?int}
     */
    private function rate(array $window): array
    {
        // Another worker may have saved a price since this process read them.
        $this->prices->flush();

        $amount = 0.0;
        $priced = false;
        $usage = [];
        $unpricedSteps = 0;
        $unpricedTokens = null;
        $rates = [];

        foreach ($this->groups($window) as $row) {
            $steps = Row::int($row, 'reported_steps');

            // Nothing was reported: there is nothing to price or to leave out.
            if ($steps === 0) {
                continue;
            }

            $usage[Row::int($row, 'slot')] = true;

            $provider = Row::nullableString($row, 'provider');
            $model = Row::nullableString($row, 'model');
            $cost = null;

            if ($provider !== null && $model !== null) {
                $rate = $rates[$provider."\0".$model] ??= $this->prices->rateFor($provider, $model);
                $cost = $rate === null ? null : self::cost($rate, $row);
            }

            if ($cost === null) {
                $unpricedSteps += $steps;
                $tokens = [Row::nullableInt($row, 'input_tokens'), Row::nullableInt($row, 'output_tokens')];

                if ($tokens !== [null, null]) {
                    $unpricedTokens = ($unpricedTokens ?? 0) + array_sum($tokens);
                }

                continue;
            }

            $priced = true;
            $amount += $cost;
        }

        return [
            'amount' => $amount,
            'priced' => $priced,
            'withUsage' => count($usage),
            'unpricedSteps' => $unpricedSteps,
            'unpricedTokens' => $unpricedSteps === 0 ? 0 : $unpricedTokens,
        ];
    }

    /**
     * The cost calculator's formula applied to the sums of a group. Null when the group cannot be priced.
     */
    private static function cost(Rate $rate, object $row): ?float
    {
        $uncached = Row::nullableInt($row, 'uncached_input_tokens');
        $output = Row::nullableInt($row, 'output_tokens');

        if ($uncached === null || ($output === null && $rate->output !== null)) {
            return null;
        }

        $total = 0.0;

        foreach ([
            [$uncached, $rate->input],
            [$output ?? 0, $rate->output],
            [Row::int($row, 'cache_read_tokens'), $rate->cacheRead],
            [Row::int($row, 'cache_write_tokens'), $rate->cacheWrite],
        ] as [$tokens, $perMillion]) {
            if ($tokens === 0) {
                continue;
            }

            if ($perMillion === null) {
                return null;
            }

            $total += $tokens * $perMillion / self::MILLION;
        }

        return $total;
    }

    /**
     * One grouped read: the tokens of the runs that started in the window, by bucket, provider and
     * model, without the runs still running. A run belongs to the first bucket whose end is after its start.
     *
     * @param  list<OverviewBucket>  $window
     * @return list<object>
     */
    private function groups(array $window): array
    {
        $whens = [];
        $bindings = [];

        foreach (array_slice($window, 0, -1) as $slot => $bucket) {
            $whens[] = 'when m.started_at < ? then ?';
            array_push($bindings, StaleRuns::format($bucket->to), $slot);
        }

        $query = Trace::query()->toBase()->newQuery()->from('trail_trace_models as m')
            ->join('trail_traces as t', 't.id', '=', 'm.trace_id');

        if ($whens === []) {
            $query->selectRaw('0 as slot');
        } else {
            $query->selectRaw('case '.implode(' ', $whens).' else ? end as slot', [...$bindings, count($window) - 1]);
        }

        $query->addSelect('m.provider', 'm.model')
            ->selectRaw('sum(m.uncached_input_tokens) as uncached_input_tokens')
            ->selectRaw('sum(m.input_tokens) as input_tokens')
            ->selectRaw('sum(m.output_tokens) as output_tokens')
            ->selectRaw('sum(m.cache_read_tokens) as cache_read_tokens')
            ->selectRaw('sum(m.cache_write_tokens) as cache_write_tokens')
            ->selectRaw('sum(m.reported_steps) as reported_steps')
            ->where('m.started_at', '>=', StaleRuns::format($window[0]->from))
            ->where('m.started_at', '<', StaleRuns::format($window[count($window) - 1]->to))
            ->whereRaw('not (t.status = ? and t.created_at >= ?)', [Status::Running->value, StaleRuns::cutoffColumn()])
            ->groupBy('slot', 'm.provider', 'm.model');

        return array_values(array_filter($query->get()->all(), is_object(...)));
    }
}
