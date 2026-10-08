<?php

namespace Astro\Trail\Queries;

use Astro\Trail\Enums\Status;
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
            $last = $index === count($cuts) - 1;

            $buckets[] = new OverviewBucket(
                from: $cut['from'],
                to: $cut['to'],
                full: $cut['full'],
                // Only the last bucket is open, and only for a range that has not ended in the past.
                inProgress: $last && ($range->preset !== null || $range->to >= $now) && $cut['end'] > $now,
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
     * @param  list<array{from: CarbonImmutable, to: CarbonImmutable, end: CarbonImmutable, full: bool}>  $cuts
     * @return array<int, object> by slot
     */
    private function rows(TimeRange $range, TimeRange $previousRange, array $cuts, RunScope $scope): array
    {
        $running = Status::Running->value;
        $cutoff = StaleRuns::cutoffColumn();

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
            ->selectRaw(self::count('status = ?').' as completed', [Status::Completed->value])
            ->selectRaw(self::count('status = ?').' as failed', [Status::Failed->value])
            ->selectRaw(self::count('status = ? or (status = ? and created_at < ?)').' as incomplete', [Status::Incomplete->value, $running, $cutoff])
            ->selectRaw(self::count('status = ? and created_at >= ?').' as running', [$running, $cutoff])
            ->selectRaw(self::count('status = ?').' as awaiting_approval', [Status::AwaitingApproval->value])
            ->selectRaw('count(duration_ms) as measured')
            ->selectRaw('sum(duration_ms) as duration_sum')
            ->selectRaw('sum(input_tokens) as input_tokens')
            ->selectRaw('sum(output_tokens) as output_tokens')
            ->selectRaw('sum(cache_read_tokens) as cache_read_tokens')
            ->selectRaw('sum(cache_write_tokens) as cache_write_tokens')
            ->selectRaw('sum(reasoning_tokens) as reasoning_tokens')
            ->selectRaw(self::count('input_tokens is not null or output_tokens is not null or cache_read_tokens is not null or cache_write_tokens is not null or reasoning_tokens is not null').' as reported')
            ->selectRaw('sum(cost) as cost_sum')
            ->selectRaw('sum(unpriced_span_count) as unpriced_spans')
            ->selectRaw(self::count('unpriced_span_count > 0').' as unpriced_runs')
            ->selectRaw(self::count('cost is null').' as without_amount')
            ->groupBy('slot');

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

    /**
     * The sum of a condition: how many rows meet it.
     *
     * @param  literal-string  $condition
     * @return literal-string
     */
    private static function count(string $condition): string
    {
        return 'sum(case when '.$condition.' then 1 else 0 end)';
    }
}
