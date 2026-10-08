<?php

namespace Astro\Trail\Tests\Performance;

use Astro\Trail\Storage\StaleRuns;
use Carbon\CarbonImmutable;
use Illuminate\Database\Connection;

/**
 * The query shapes the overview measurement compares. Each runs against `trail_traces` for a
 * range, the period of equal length just before it, and the range cut into clock-aligned buckets,
 * and returns the same normalised result so that the shapes can be checked against one another.
 *
 * Portable SQL only: a searched `case`, `sum`, `count`, `group by` an output alias and
 * `limit`/`offset`. Dates are bound as strings through StaleRuns::format().
 */
final class OverviewShapes
{
    /** Figures a bucket of the series carries. */
    public const SERIES = ['total', 'completed', 'failed', 'incomplete', 'running', 'awaiting_approval', 'duration_sum', 'duration_count', 'cost_sum', 'unpriced_runs'];

    /** Figures the totals carry besides the series ones. */
    public const EXTRA = ['input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'reasoning_tokens', 'no_tokens', 'unpriced_spans'];

    private const TOKENS = ['input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'reasoning_tokens'];

    /** @var list<CarbonImmutable> the moments inside the range at which a new bucket starts */
    public readonly array $boundaries;

    public readonly CarbonImmutable $previousFrom;

    private readonly string $cutoff;

    /** @var array<string, list<float>> milliseconds of each query of the last run, by label */
    public array $timings = [];

    /** @var list<array{label: string, sql: string, bindings: list<mixed>}> */
    public array $queries = [];

    public function __construct(
        private readonly Connection $db,
        public readonly CarbonImmutable $from,
        public readonly CarbonImmutable $to,
        string $unit,
        private readonly ?string $agent = null,
    ) {
        $seconds = $from->diffInSeconds($to, absolute: true);
        $this->previousFrom = $from->subSeconds((int) $seconds);
        $this->boundaries = self::boundaries($from, $to, $unit);
        $this->cutoff = StaleRuns::cutoffColumn();
    }

    /**
     * Where each bucket after the first starts: the clock-aligned moments inside (from, to).
     *
     * @return list<CarbonImmutable>
     */
    public static function boundaries(CarbonImmutable $from, CarbonImmutable $to, string $unit): array
    {
        $step = match ($unit) {
            '5 minutes' => fn (CarbonImmutable $moment) => $moment->addMinutes(5),
            'hour' => fn (CarbonImmutable $moment) => $moment->addHour(),
            'day' => fn (CarbonImmutable $moment) => $moment->addDay(),
        };

        $first = match ($unit) {
            '5 minutes' => $from->setTime((int) $from->format('H'), intdiv((int) $from->format('i'), 5) * 5),
            'hour' => $from->startOfHour(),
            'day' => $from->startOfDay(),
        };

        $boundaries = [];

        for ($moment = $step($first); $moment < $to; $moment = $step($moment)) {
            $boundaries[] = $moment;
        }

        return $boundaries;
    }

    public function bucketCount(): int
    {
        return count($this->boundaries) + 1;
    }

    /**
     * Candidate A: one pass, slot 0 the previous period and slots 1..N the buckets; the totals of
     * the range are added up from the bucket rows in PHP.
     *
     * @return array{previous: array<string, int|float|null>, current: array<string, int|float|null>, buckets: list<array<string, int|float|null>>}
     */
    public function onePass(): array
    {
        [$case, $caseBindings] = $this->slots(withPrevious: true);
        [$figures, $figureBindings] = $this->figures([...self::SERIES, ...self::EXTRA]);

        $rows = $this->select('A', "select {$case} as slot, {$figures} from trail_traces where started_at >= ? and started_at < ?{$this->scope()} group by slot order by slot", [
            ...$caseBindings, ...$figureBindings, StaleRuns::format($this->previousFrom), StaleRuns::format($this->to), ...$this->scopeBindings(),
        ]);

        $slots = [];

        foreach ($rows as $row) {
            $slots[(int) $row->slot] = self::normalise((array) $row);
        }

        $empty = self::normalise([]);
        $buckets = [];

        for ($slot = 1; $slot <= $this->bucketCount(); $slot++) {
            $buckets[] = $slots[$slot] ?? $empty;
        }

        return [
            'previous' => $slots[0] ?? $empty,
            'current' => self::add($buckets),
            'buckets' => $buckets,
        ];
    }

    /**
     * Candidate B: two queries, the totals grouped by period and the series grouped by bucket.
     *
     * @return array{previous: array<string, int|float|null>, current: array<string, int|float|null>, buckets: list<array<string, int|float|null>>}
     */
    public function twoQueries(): array
    {
        [$figures, $figureBindings] = $this->figures([...self::SERIES, ...self::EXTRA]);

        $periods = $this->select('B1', "select case when started_at < ? then 0 else 1 end as slot, {$figures} from trail_traces where started_at >= ? and started_at < ?{$this->scope()} group by slot order by slot", [
            StaleRuns::format($this->from), ...$figureBindings, StaleRuns::format($this->previousFrom), StaleRuns::format($this->to), ...$this->scopeBindings(),
        ]);

        [$case, $caseBindings] = $this->slots(withPrevious: false);
        [$series, $seriesBindings] = $this->figures(self::SERIES);

        $rows = $this->select('B2', "select {$case} as slot, {$series} from trail_traces where started_at >= ? and started_at < ?{$this->scope()} group by slot order by slot", [
            ...$caseBindings, ...$seriesBindings, StaleRuns::format($this->from), StaleRuns::format($this->to), ...$this->scopeBindings(),
        ]);

        $totals = [];

        foreach ($periods as $row) {
            $totals[(int) $row->slot] = self::normalise((array) $row);
        }

        $slots = [];

        foreach ($rows as $row) {
            $slots[(int) $row->slot] = self::normalise((array) $row);
        }

        $empty = self::normalise([]);
        $buckets = [];

        for ($slot = 1; $slot <= $this->bucketCount(); $slot++) {
            $buckets[] = $slots[$slot] ?? $empty;
        }

        return [
            'previous' => $totals[0] ?? $empty,
            'current' => $totals[1] ?? $empty,
            'buckets' => $buckets,
        ];
    }

    /**
     * Candidate C: one row and no `group by`: a conditional aggregate for each figure of each
     * bucket, and every figure for the previous period and for the range as a whole.
     *
     * @return array{previous: array<string, int|float|null>, current: array<string, int|float|null>, buckets: list<array<string, int|float|null>>}
     */
    public function oneRow(): array
    {
        $select = [];
        $bindings = [];
        $slots = [];

        $edges = [$this->from, ...$this->boundaries, $this->to];
        $all = [...self::SERIES, ...self::EXTRA];

        $slots['previous'] = ['started_at >= ? and started_at < ?', [StaleRuns::format($this->previousFrom), StaleRuns::format($this->from)], $all];
        $slots['current'] = ['started_at >= ? and started_at < ?', [StaleRuns::format($this->from), StaleRuns::format($this->to)], $all];

        for ($index = 0; $index < count($edges) - 1; $index++) {
            $slots['b'.$index] = ['started_at >= ? and started_at < ?', [StaleRuns::format($edges[$index]), StaleRuns::format($edges[$index + 1])], self::SERIES];
        }

        foreach ($slots as $slot => [$condition, $slotBindings, $names]) {
            foreach ($names as $name) {
                [$aggregate, $value, $valueBindings] = $this->figure($name);
                $select[] = "{$aggregate}(case when {$condition} then {$value} end) as {$slot}__{$name}";
                // The condition's bindings come before the value's, as they appear in the text.
                array_push($bindings, ...$slotBindings, ...$valueBindings);
            }
        }

        $rows = $this->select('C', 'select '.implode(', ', $select)." from trail_traces where started_at >= ? and started_at < ?{$this->scope()}", [
            ...$bindings, StaleRuns::format($this->previousFrom), StaleRuns::format($this->to), ...$this->scopeBindings(),
        ]);

        $row = (array) ($rows[0] ?? new \stdClass);
        $pick = function (string $slot) use ($row): array {
            $figures = [];

            foreach ($row as $key => $value) {
                if (str_starts_with((string) $key, $slot.'__')) {
                    $figures[substr((string) $key, strlen($slot) + 2)] = $value;
                }
            }

            return self::normalise($figures);
        };

        $buckets = [];

        for ($index = 0; $index < $this->bucketCount(); $index++) {
            $buckets[] = $pick('b'.$index);
        }

        return ['previous' => $pick('previous'), 'current' => $pick('current'), 'buckets' => $buckets];
    }

    /**
     * Candidate D: the nearest-rank 95th percentile of the durations of each period by ordered
     * offset: a count, then one row at the offset. With $counts given, only the offset queries run.
     *
     * @param  array{previous: int, current: int}|null  $counts  how many runs with a duration each period holds, when known
     * @return array{previous: ?float, current: ?float, counts: array{previous: int, current: int}}
     */
    public function percentiles(?array $counts = null): array
    {
        $periods = [
            'previous' => [$this->previousFrom, $this->from],
            'current' => [$this->from, $this->to],
        ];

        $result = ['counts' => ['previous' => 0, 'current' => 0]];

        foreach ($periods as $period => [$low, $high]) {
            $where = "duration_ms is not null and started_at >= ? and started_at < ?{$this->scope()}";
            $bindings = [StaleRuns::format($low), StaleRuns::format($high), ...$this->scopeBindings()];

            if ($counts === null) {
                $count = (int) ($this->select("D {$period} count", "select count(*) as aggregate from trail_traces where {$where}", $bindings)[0]->aggregate ?? 0);
            } else {
                $count = $counts[$period];
            }

            $result['counts'][$period] = $count;

            if ($count === 0) {
                $result[$period] = null;

                continue;
            }

            $rank = intdiv(95 * $count + 99, 100);
            $rows = $this->select("D {$period} offset", 'select duration_ms from trail_traces where '.$where.' order by duration_ms limit 1 offset '.($rank - 1), $bindings);
            $value = $rows[0]->duration_ms ?? null;
            $result[$period] = is_numeric($value) ? (float) $value : null;
        }

        return $result;
    }

    /**
     * The sum of cost and the figures beside it as the driver hands them over, for the periods
     * and buckets of candidate A, so that the type and the arithmetic can be checked.
     *
     * @return array{type: string, buckets: list<mixed>, total: mixed, rows: mixed}
     */
    public function rawCost(): array
    {
        [$case, $caseBindings] = $this->slots(withPrevious: false);

        $buckets = $this->db->select("select {$case} as slot, sum(cost) as cost_sum from trail_traces where started_at >= ? and started_at < ?{$this->scope()} group by slot order by slot", [
            ...$caseBindings, StaleRuns::format($this->from), StaleRuns::format($this->to), ...$this->scopeBindings(),
        ]);

        $total = $this->db->select("select sum(cost) as cost_sum from trail_traces where started_at >= ? and started_at < ?{$this->scope()}", [
            StaleRuns::format($this->from), StaleRuns::format($this->to), ...$this->scopeBindings(),
        ]);

        $values = array_map(fn ($row) => $row->cost_sum, $buckets);

        return [
            'type' => get_debug_type($total[0]->cost_sum ?? null),
            'buckets' => $values,
            'total' => $total[0]->cost_sum ?? null,
            'rows' => count($buckets),
        ];
    }

    /**
     * What each driver returns for each kind of aggregate, by PHP type.
     *
     * @return array<string, string>
     */
    public function aggregateTypes(): array
    {
        $row = (array) $this->db->select('select count(*) as c, sum(case when status = ? then 1 else 0 end) as s, sum(duration_ms) as d, count(duration_ms) as dc, sum(input_tokens) as t, sum(cost) as cost, sum(unpriced_span_count) as u from trail_traces', ['completed'])[0];

        return array_map(fn ($value) => get_debug_type($value), $row);
    }

    /**
     * @param  list<mixed>  $bindings
     * @return list<\stdClass>
     */
    private function select(string $label, string $sql, array $bindings): array
    {
        $this->queries[] = ['label' => $label, 'sql' => $sql, 'bindings' => $bindings];

        $start = hrtime(true);
        $rows = $this->db->select($sql, $bindings);
        $this->timings[$label][] = (hrtime(true) - $start) / 1e6;

        return $rows;
    }

    private function scope(): string
    {
        return $this->agent === null ? '' : ' and name = ?';
    }

    /**
     * @return list<string>
     */
    private function scopeBindings(): array
    {
        return $this->agent === null ? [] : [$this->agent];
    }

    /**
     * One searched `case` that names the slot of a row by when it started.
     *
     * @return array{0: string, 1: list<string>}
     */
    private function slots(bool $withPrevious): array
    {
        $edges = $withPrevious ? [$this->from, ...$this->boundaries] : [...$this->boundaries];
        $first = $withPrevious ? 0 : 1;
        $bindings = [];
        $whens = [];

        foreach ($edges as $index => $edge) {
            $whens[] = 'when started_at < ? then '.($first + $index);
            $bindings[] = StaleRuns::format($edge);
        }

        return ['case '.implode(' ', $whens).' else '.($first + count($edges)).' end', $bindings];
    }

    /**
     * The select list for the figures and the bindings its placeholders take.
     *
     * @param  list<string>  $names
     * @return array{0: string, 1: list<string>}
     */
    private function figures(array $names): array
    {
        $list = [];
        $bindings = [];

        foreach ($names as $name) {
            [$aggregate, $value, $valueBindings] = $this->figure($name);
            $list[] = "{$aggregate}({$value}) as {$name}";
            array_push($bindings, ...$valueBindings);
        }

        return [implode(', ', $list), $bindings];
    }

    /**
     * How a figure is aggregated: the function, the value it takes of each row and the bindings of
     * that value. The stale rule is the one of TraceIndex::statusCounts: a running run first stored
     * before the cutoff is incomplete.
     *
     * @return array{0: string, 1: string, 2: list<string>}
     */
    private function figure(string $name): array
    {
        return match ($name) {
            'total' => ['sum', '1', []],
            'completed', 'failed', 'awaiting_approval' => ['sum', "case when status = '{$name}' then 1 else 0 end", []],
            'incomplete' => ['sum', "case when status = 'incomplete' or (status = 'running' and created_at < ?) then 1 else 0 end", [$this->cutoff]],
            'running' => ['sum', "case when status = 'running' and created_at >= ? then 1 else 0 end", [$this->cutoff]],
            'duration_sum' => ['sum', 'duration_ms', []],
            'duration_count' => ['count', 'duration_ms', []],
            'cost_sum' => ['sum', 'cost', []],
            'unpriced_spans' => ['sum', 'unpriced_span_count', []],
            'unpriced_runs' => ['sum', 'case when unpriced_span_count > 0 then 1 else 0 end', []],
            'no_tokens' => ['sum', 'case when '.implode(' and ', array_map(fn (string $column) => "{$column} is null", self::TOKENS)).' then 1 else 0 end', []],
            default => ['sum', $name, []],
        };
    }

    /**
     * The figures as numbers: counts as integers, sums as floats, and null where the database had
     * no value to add up (a sum over no rows with a value is null; a count never is).
     *
     * @param  array<string, mixed>  $row
     * @return array<string, int|float|null>
     */
    public static function normalise(array $row): array
    {
        $figures = [];

        foreach ([...self::SERIES, ...self::EXTRA] as $name) {
            $value = $row[$name] ?? null;
            $counts = ! in_array($name, ['duration_sum', 'cost_sum', 'unpriced_spans', ...self::TOKENS], true);

            $figures[$name] = match (true) {
                $counts => is_numeric($value) ? (int) $value : 0,
                is_numeric($value) => (float) $value,
                default => null,
            };
        }

        return $figures;
    }

    /**
     * @param  list<array<string, int|float|null>>  $slots
     * @return array<string, int|float|null>
     */
    public static function add(array $slots): array
    {
        $sum = self::normalise([]);

        foreach ($slots as $slot) {
            foreach ($slot as $name => $value) {
                $sum[$name] = $value === null ? $sum[$name] : ($sum[$name] ?? 0) + $value;
            }
        }

        return $sum;
    }
}
