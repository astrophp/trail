<?php

namespace Astro\Trail\Queries;

use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Storage\StaleRuns;
use Carbon\CarbonImmutable;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

/**
 * The reads behind the overview: the figures of a range, of the period of equal length just before
 * it, and of each bucket of the range, whatever the range's length, in one grouped pass over the
 * runs plus at most two reads for the 95th percentiles. Every read is narrowed by a scope.
 */
final class OverviewQuery
{
    /** Below this many runs with a duration the nearest-rank 95th percentile is just the slowest. */
    public const P95_MINIMUM = 20;

    /** The share of runs a percentile is at or below. */
    private const PERCENTILE = 95;

    /**
     * @throws ValidationException when the range is too long to be cut into buckets
     */
    public function read(TimeRange $range, RunScope $scope): Overview
    {
        $unit = BucketUnit::for($range);
        $cuts = $unit->buckets($range);
        $previousRange = $this->previousRange($range);
        $now = Carbon::now();

        $rows = $this->rows($range, $previousRange, $cuts, $scope);

        $buckets = [];

        foreach ($cuts as $index => $cut) {
            $buckets[] = new OverviewBucket(
                from: $cut['from'],
                to: $cut['to'],
                full: $cut['full'],
                // By the clock: now is inside the bucket's span before the range cut it.
                inProgress: $cut['start'] <= $now && $now < $cut['end'],
                figures: RunFigures::fromRow($rows[$index + 1] ?? null),
            );
        }

        $current = RunFigures::sum(array_map(fn (OverviewBucket $bucket) => $bucket->figures, $buckets));
        $previous = RunFigures::fromRow($rows[0] ?? null);

        return new Overview(
            summary: new OverviewSummary($current, $this->p95($range, $scope, $current->measured)),
            previous: $previous->runs['all'] === 0 ? null : new OverviewSummary($previous, $this->p95($previousRange, $scope, $previous->measured)),
            previousRange: $previousRange,
            unit: $unit,
            buckets: $buckets,
        );
    }

    /**
     * The window of equal length that ends where the range starts.
     */
    private function previousRange(TimeRange $range): TimeRange
    {
        $milliseconds = $range->to->getTimestampMs() - $range->from->getTimestampMs();

        return new TimeRange(null, $range->from->subMilliseconds($milliseconds), $range->from);
    }

    /**
     * One pass: slot 0 is the previous window and slots 1..N the buckets in order, each holding
     * the aggregates of its runs. The stale rule is applied to every run before it is counted.
     *
     * @param  list<array{start: CarbonImmutable, end: CarbonImmutable, from: CarbonImmutable, to: CarbonImmutable, full: bool}>  $cuts
     * @return array<int, object> by slot
     */
    private function rows(TimeRange $range, TimeRange $previousRange, array $cuts, RunScope $scope): array
    {
        // A run belongs to the first slot whose end is after its start. The last bucket needs no test.
        $ends = [$range->from, ...array_map(fn (array $cut) => $cut['to'], array_slice($cuts, 0, -1))];
        $whens = [];
        $bindings = [];

        foreach ($ends as $slot => $end) {
            $whens[] = 'when started_at < ? then ?';
            array_push($bindings, StaleRuns::format($end), $slot);
        }

        $bindings[] = count($ends);

        $query = Trace::query()->toBase()
            ->selectRaw('case '.implode(' ', $whens).' else ? end as slot', $bindings)
            ->groupBy('slot');
        RunFigures::select($query);

        (new TimeRange(null, $previousRange->from, $range->to))->apply($query, 'started_at');
        $scope->apply($query);

        $slots = [];

        foreach ($query->get() as $row) {
            if (is_numeric($row->slot ?? null)) {
                $slots[(int) $row->slot] = $row;
            }
        }

        return $slots;
    }

    /**
     * The nearest-rank percentile of the durations in the range by ordered offset, with no
     * vendor percentile function. The count of runs with a duration is already known from the
     * grouped pass, so only the offset read runs, and not at all below the minimum.
     */
    private function p95(TimeRange $range, RunScope $scope, int $measured): ?float
    {
        if ($measured < self::P95_MINIMUM) {
            return null;
        }

        $rank = intdiv(self::PERCENTILE * $measured + 99, 100);

        $query = Trace::query()->whereNotNull('duration_ms');
        $range->apply($query, 'started_at');
        $scope->apply($query);

        $duration = $query->orderBy('duration_ms')->offset($rank - 1)->limit(1)->value('duration_ms');

        return is_numeric($duration) ? (float) $duration : null;
    }
}
