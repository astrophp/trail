<?php

namespace Astro\Trail\Tests\Performance;

use Astro\Trail\Enums\SpanType;
use Astro\Trail\Queries\TimeRange;
use Astro\Trail\Queries\TraceIndex;
use Astro\Trail\Storage\StaleRuns;
use Carbon\CarbonImmutable;
use Illuminate\Database\Connection;
use Illuminate\Database\Query\Builder;
use Illuminate\Database\Query\JoinClause;
use ReflectionClassConstant;

/**
 * The candidate reads behind an agents list and an agent's page, one small method each. They are
 * plain SQL through the query builder, with nothing vendor-specific, so each runs on SQLite too.
 * None of them is part of the package yet: this is what the measurement times.
 *
 * Rows come back as arrays; a name is an agent, and "runs" are `trail_traces` rows.
 */
final class AgentReads
{
    /** The rows of a page. */
    public const PAGE = 25;

    /** The columns the combined read carries from each of its two sources, in order. */
    private const COMBINED = [
        'runs', 'completed', 'failed', 'incomplete', 'running', 'awaiting_approval', 'measured', 'duration_sum',
        'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'reasoning_tokens',
        'cost_sum', 'unpriced_spans', 'unpriced_runs', 'latest', 'delegated', 'delegated_failed', 'delegated_latest',
    ];

    public function __construct(private readonly Connection $db) {}

    // A. Agents by the runs they are the name of ------------------------------------------------

    /**
     * Every agent of the range, from the runs alone.
     *
     * @return list<array<string, mixed>>
     */
    public function topLevel(TimeRange $range): array
    {
        return self::rows($this->topLevelQuery($range));
    }

    /**
     * A page of agents and how many there are in all: two queries.
     *
     * @return array{rows: list<array<string, mixed>>, total: int}
     */
    public function topLevelPage(TimeRange $range, string $sort): array
    {
        return [
            'rows' => self::rows(self::page($this->topLevelQuery($range), $sort)),
            'total' => $this->total($range),
        ];
    }

    private function topLevelQuery(TimeRange $range): Builder
    {
        $query = $this->db->table('trail_traces')->select('name');
        self::figures($query);
        $range->apply($query, 'started_at');

        return $query->groupBy('name');
    }

    private function total(TimeRange $range): int
    {
        $query = $this->db->table('trail_traces')->selectRaw('count(distinct name) as total');
        $range->apply($query, 'started_at');

        return (int) ($query->first()->total ?? 0);
    }

    /**
     * What a run adds to its agent: the status counts with the stale rule, the durations, usage and cost.
     */
    private static function figures(Builder $query): void
    {
        $running = 'running';
        $cutoff = StaleRuns::cutoffColumn();

        $query->selectRaw('count(*) as runs')
            ->selectRaw(self::countIf('status = ?').' as completed', ['completed'])
            ->selectRaw(self::countIf('status = ?').' as failed', ['failed'])
            ->selectRaw(self::countIf('status = ? or (status = ? and created_at < ?)').' as incomplete', ['incomplete', $running, $cutoff])
            ->selectRaw(self::countIf('status = ? and created_at >= ?').' as running', [$running, $cutoff])
            ->selectRaw(self::countIf('status = ?').' as awaiting_approval', ['awaiting_approval'])
            ->selectRaw('count(duration_ms) as measured')
            ->selectRaw('sum(duration_ms) as duration_sum')
            ->selectRaw('sum(input_tokens) as input_tokens')
            ->selectRaw('sum(output_tokens) as output_tokens')
            ->selectRaw('sum(cache_read_tokens) as cache_read_tokens')
            ->selectRaw('sum(cache_write_tokens) as cache_write_tokens')
            ->selectRaw('sum(reasoning_tokens) as reasoning_tokens')
            ->selectRaw('sum(cost) as cost_sum')
            ->selectRaw('sum(unpriced_span_count) as unpriced_spans')
            ->selectRaw(self::countIf('unpriced_span_count > 0').' as unpriced_runs')
            ->selectRaw('max(started_at) as latest');
    }

    /**
     * The first page of a grouped read: by runs, or by cost with the agents that have none last.
     */
    private static function page(Builder $query, string $sort): Builder
    {
        $sort === 'cost'
            ? $query->orderByRaw('case when sum(cost) is null then 1 else 0 end')->orderByRaw('sum(cost) desc')
            : $query->orderByRaw('count(*) desc');

        return $query->orderBy('name')->limit(self::PAGE);
    }

    // B. Runs an agent was delegated --------------------------------------------------------------

    /**
     * Sub-agent runs by name, bounded to the runs of the range in one of three ways: `in` (a
     * semi-join on the runs), `join`, or `bounded` (the semi-join, and the spans' own start at or
     * after the range's, which a span never precedes its run in).
     *
     * @return list<array<string, mixed>>
     */
    public function delegated(TimeRange $range, string $bounding): array
    {
        return self::rows($this->delegatedQuery($range, $bounding));
    }

    private function delegatedQuery(TimeRange $range, string $bounding): Builder
    {
        $query = $this->db->table('trail_spans as s')
            ->select('s.name')
            ->selectRaw('count(*) as delegated')
            ->selectRaw(self::countIf("s.status = 'failed'").' as delegated_failed')
            ->selectRaw('max(s.started_at) as delegated_latest')
            ->where('s.type', 'agent')
            ->whereNotNull('s.parent_id');

        if ($bounding === 'join') {
            $query->join('trail_traces as t', 't.id', '=', 's.trace_id');
            $range->apply($query, 't.started_at');
        } else {
            $query->whereIn('s.trace_id', $this->runsOf($range));
        }

        if ($bounding === 'bounded') {
            $query->where('s.started_at', '>=', StaleRuns::format($range->from));
        }

        return $query->groupBy('s.name');
    }

    // C. Both sources as one grouped result --------------------------------------------------------

    /**
     * Agents by name over the runs and the sub-agent runs together, the database deciding which
     * names are one agent: a page, and how many there are in all (two queries).
     *
     * @return array{rows: list<array<string, mixed>>, total: int}
     */
    public function combinedPage(TimeRange $range, string $sort): array
    {
        $outer = $this->db->query()->fromSub($this->union($range), 'u')->select('name');

        foreach (self::COMBINED as $column) {
            $outer->selectRaw(($column === 'latest' || $column === 'delegated_latest' ? 'max' : 'sum').'('.$column.') as '.$column);
        }

        $sort === 'cost'
            ? $outer->orderByRaw('case when sum(cost_sum) is null then 1 else 0 end')->orderByRaw('sum(cost_sum) desc')
            : $outer->orderByRaw('sum(runs) desc');

        return [
            'rows' => self::rows($outer->groupBy('name')->orderBy('name')->limit(self::PAGE)),
            'total' => (int) ($this->db->query()->fromSub($this->union($range), 'u')->selectRaw('count(distinct name) as total')->first()->total ?? 0),
        ];
    }

    private function union(TimeRange $range): Builder
    {
        $runs = $this->topLevelQuery($range)
            ->selectRaw('0 as delegated')->selectRaw('0 as delegated_failed')->selectRaw('null as delegated_latest');

        // The sub-agent runs, padded with the columns the runs have and they do not.
        $own = $this->db->query()->fromSub($this->delegatedQuery($range, 'bounded'), 'd')->select('name');

        foreach (self::COMBINED as $column) {
            $own->selectRaw(match ($column) {
                'delegated', 'delegated_failed', 'delegated_latest' => $column,
                'runs', 'completed', 'failed', 'incomplete', 'running', 'awaiting_approval', 'measured', 'unpriced_runs' => '0 as '.$column,
                default => 'null as '.$column,
            });
        }

        return $runs->unionAll($own);
    }

    /**
     * A and B read apart, merged by name in PHP: what C replaces.
     *
     * @return list<array<string, mixed>> every agent, unordered
     */
    public function merged(TimeRange $range): array
    {
        $agents = [];

        foreach ($this->topLevel($range) as $row) {
            $agents[(string) $row['name']] = $row + ['delegated' => 0, 'delegated_failed' => 0, 'delegated_latest' => null];
        }

        foreach ($this->delegated($range, 'bounded') as $row) {
            $name = (string) $row['name'];
            $agents[$name] ??= ['name' => $name, ...array_fill_keys(self::COMBINED, null), ...array_fill_keys(['runs', 'completed', 'failed', 'incomplete', 'running', 'awaiting_approval', 'measured', 'unpriced_runs'], 0)];
            $agents[$name] = [...$agents[$name], 'delegated' => $row['delegated'], 'delegated_failed' => $row['delegated_failed'], 'delegated_latest' => $row['delegated_latest']];
        }

        return array_values($agents);
    }

    // D. The 95th percentile of an agent's durations ------------------------------------------------

    /**
     * The nearest-rank 95th percentile of the durations of each agent's runs, in one read with
     * window functions: the row at the rank ceil(0.95 * measured), whatever the vendor.
     *
     * @param  list<string>|null  $names  only these agents, or all
     * @return list<array<string, mixed>> name, duration_ms, place, measured
     */
    public function p95Window(TimeRange $range, ?array $names): array
    {
        $runs = $this->db->table('trail_traces')->select('name', 'duration_ms')
            ->selectRaw('row_number() over (partition by name order by duration_ms) as place')
            ->selectRaw('count(*) over (partition by name) as measured')
            ->whereNotNull('duration_ms');
        $range->apply($runs, 'started_at');

        if ($names !== null) {
            $runs->whereIn('name', $names);
        }

        // 100 * place >= 95 * measured > 100 * (place - 1): the integer form of place = ceil(0.95 * measured).
        $ranked = $this->db->query()->fromSub($runs, 't')->select('name', 'duration_ms', 'place', 'measured')
            ->whereRaw('100 * place >= 95 * measured')
            ->whereRaw('100 * (place - 1) < 95 * measured')
            ->orderBy('name');

        return self::rows($ranked);
    }

    /**
     * The same percentiles one agent at a time by ordered offset (the overview's own method), given
     * how many runs with a duration each has, which the agents read already told.
     *
     * @param  array<string, int>  $measured  agent => runs with a duration
     * @return list<array<string, mixed>> name, duration_ms, place, measured
     */
    public function p95Offsets(TimeRange $range, array $measured): array
    {
        $found = [];

        foreach ($measured as $name => $count) {
            if ($count === 0) {
                continue;
            }

            $place = intdiv(95 * $count + 99, 100);
            $query = $this->db->table('trail_traces')->where('name', $name)->whereNotNull('duration_ms');
            $range->apply($query, 'started_at');

            $found[] = ['name' => $name, 'duration_ms' => $query->orderBy('duration_ms')->offset($place - 1)->limit(1)->value('duration_ms'), 'place' => $place, 'measured' => $count];
        }

        return $found;
    }

    // E. A series of runs for each agent ----------------------------------------------------------------

    /**
     * Runs per agent and clock bucket for the given agents, in one read grouped by name and slot.
     *
     * @param  list<string>  $names
     * @param  list<array{to: CarbonImmutable}>  $cuts  the buckets of the range, as BucketUnit::buckets() gives them
     * @return list<array<string, mixed>> name, slot, runs
     */
    public function series(TimeRange $range, array $names, array $cuts): array
    {
        $whens = [];
        $bindings = [];

        foreach (array_slice($cuts, 0, -1) as $slot => $cut) {
            $whens[] = 'when started_at < ? then ?';
            array_push($bindings, StaleRuns::format($cut['to']), $slot);
        }

        $bindings[] = count($cuts) - 1;

        $query = $this->db->table('trail_traces')->select('name')
            ->selectRaw('case '.implode(' ', $whens).' else ? end as slot', $bindings)
            ->selectRaw('count(*) as runs')
            ->whereIn('name', $names);
        $range->apply($query, 'started_at');

        return self::rows($query->groupBy('name', 'slot'));
    }

    // F, G. What the runs of one agent used and called ----------------------------------------------------

    /**
     * The models the steps of an agent's runs used, delegated agents' steps included.
     *
     * @return list<array<string, mixed>>
     */
    public function modelsOf(string $agent, TimeRange $range): array
    {
        $query = $this->spansOf($agent, $range, 'step')->select('s.provider', 's.model')
            ->selectRaw('count(*) as steps')
            ->selectRaw('count(distinct s.trace_id) as runs')
            ->selectRaw('sum(s.input_tokens) as input_tokens')
            ->selectRaw('sum(s.output_tokens) as output_tokens')
            ->selectRaw('sum(s.cost) as cost_sum');

        return self::rows($query->groupBy('s.provider', 's.model'));
    }

    /**
     * The tools the runs of an agent called, a delegated agent's included.
     *
     * @return list<array<string, mixed>>
     */
    public function toolsOf(string $agent, TimeRange $range): array
    {
        $query = $this->spansOf($agent, $range, 'tool')->select('s.name')
            ->selectRaw('count(*) as calls')
            ->selectRaw(self::countIf("s.status = 'failed'").' as failed')
            ->selectRaw('count(distinct s.trace_id) as runs');

        return self::rows($query->groupBy('s.name'));
    }

    private function spansOf(string $agent, TimeRange $range, string $type): Builder
    {
        return $this->db->table('trail_spans as s')->where('s.type', $type)
            ->where('s.started_at', '>=', StaleRuns::format($range->from))
            ->whereIn('s.trace_id', $this->runsOf($range, $agent));
    }

    // H. What the sub-agent runs of one agent used and called ----------------------------------------------

    /**
     * The models and tools of the sub-agent runs of an agent: the steps and tools that are children
     * of its agent spans that have a parent, in two reads. The self-join also matches on the run, so
     * that the index on (trace_id, started_at) can serve it.
     *
     * @return array{models: list<array<string, mixed>>, tools: list<array<string, mixed>>}
     */
    public function delegatedUse(string $agent, TimeRange $range): array
    {
        $models = $this->childrenOf($agent, $range, 'step')->select('c.provider', 'c.model')
            ->selectRaw('count(*) as steps')
            ->selectRaw('sum(c.input_tokens) as input_tokens')
            ->selectRaw('sum(c.cost) as cost_sum')
            ->groupBy('c.provider', 'c.model');

        $tools = $this->childrenOf($agent, $range, 'tool')->select('c.name')
            ->selectRaw('count(*) as calls')
            ->selectRaw(self::countIf("c.status = 'failed'").' as failed')
            ->groupBy('c.name');

        return ['models' => self::rows($models), 'tools' => self::rows($tools)];
    }

    private function childrenOf(string $agent, TimeRange $range, string $type): Builder
    {
        return $this->db->table('trail_spans as a')
            ->join('trail_spans as c', fn (JoinClause $join) => $join->on('c.parent_id', '=', 'a.id')->on('c.trace_id', '=', 'a.trace_id'))
            ->where('a.type', 'agent')->where('a.name', $agent)->whereNotNull('a.parent_id')
            ->where('a.started_at', '>=', StaleRuns::format($range->from))
            ->whereIn('a.trace_id', $this->runsOf($range))
            ->where('c.type', $type);
    }

    // I. The runs that called a tool -----------------------------------------------------------------------------

    /**
     * How many runs of the range called the tool, and the first page of them, newest first.
     *
     * @return array{count: int, rows: list<array<string, mixed>>}
     */
    public function calling(string $tool, TimeRange $range): array
    {
        $count = $this->callers($tool, $range)->selectRaw('count(*) as total')->first();

        /** @var list<string> $columns */
        $columns = (new ReflectionClassConstant(TraceIndex::class, 'COLUMNS'))->getValue();

        return [
            'count' => (int) ($count->total ?? 0),
            'rows' => self::rows($this->callers($tool, $range)->select($columns)->orderByDesc('started_at')->orderByDesc('id')->limit(self::PAGE)),
        ];
    }

    private function callers(string $tool, TimeRange $range): Builder
    {
        $query = $this->db->table('trail_traces')->whereIn('id', fn (Builder $spans) => $spans->from('trail_spans')->select('trace_id')
            ->where('type', 'tool')->where('name', $tool)->where('started_at', '>=', StaleRuns::format($range->from)));
        $range->apply($query, 'started_at');

        return $query;
    }

    // K. The models of the whole range ------------------------------------------------------------------------------

    /**
     * The step spans of the range grouped by provider and model, with what the models page would
     * show. `own` bounds the steps by their own start (steps that started in the range); `runs` by the
     * runs that started in it (with the span start at or after the range's start, as the runs list
     * does). `distinct` counts the runs of each model, which costs a sort or a hash; `named` also pins
     * the span's name, which every step span has in common.
     *
     * @return list<array<string, mixed>>
     */
    public function stepModels(TimeRange $range, string $bound, bool $distinct = true, bool $named = false): array
    {
        $cutoff = StaleRuns::cutoffColumn();
        $query = $this->db->table('trail_spans as s')
            ->where('s.type', SpanType::Step->value)
            ->select('s.provider', 's.model')
            ->selectRaw('count(*) as steps')
            ->selectRaw('count(s.duration_ms) as measured')
            ->selectRaw('sum(s.duration_ms) as duration_sum')
            ->selectRaw('sum(s.input_tokens) as input_tokens')
            ->selectRaw('sum(s.output_tokens) as output_tokens')
            ->selectRaw('sum(s.cache_read_tokens) as cache_read_tokens')
            ->selectRaw('sum(s.cache_write_tokens) as cache_write_tokens')
            ->selectRaw('sum(s.reasoning_tokens) as reasoning_tokens')
            ->selectRaw('sum(s.cost) as cost_sum')
            ->selectRaw('sum(case when s.cost is null and (s.input_tokens is not null or s.output_tokens is not null or s.cache_read_tokens is not null or s.cache_write_tokens is not null or s.reasoning_tokens is not null) then 1 else 0 end) as unpriced')
            ->selectRaw('sum(case when s.status = ? and s.created_at >= ? then 1 else 0 end) as running', ['running', $cutoff]);

        if ($distinct) {
            $query->selectRaw('count(distinct s.trace_id) as runs');
        }

        if ($named) {
            $query->where('s.name', 'step');
        }

        if ($bound === 'own') {
            $range->apply($query, 's.started_at');
        } else {
            $query->where('s.started_at', '>=', StaleRuns::format($range->from))->whereIn('s.trace_id', $this->runsOf($range));
        }

        return self::rows($query->groupBy('s.provider', 's.model'));
    }

    /**
     * How far apart the two bounds are on this data: the steps and the runs each one counts.
     *
     * @return array{own_steps: int, own_runs: int, runs_steps: int, runs_runs: int}
     */
    public function stepBoundsDiffer(TimeRange $range): array
    {
        $own = $this->db->table('trail_spans as s')->where('s.type', 'step')->selectRaw('count(*) as steps, count(distinct s.trace_id) as runs');
        $range->apply($own, 's.started_at');

        $inRuns = $this->db->table('trail_spans as s')->where('s.type', 'step')->selectRaw('count(*) as steps, count(distinct s.trace_id) as runs')
            ->where('s.started_at', '>=', StaleRuns::format($range->from))->whereIn('s.trace_id', $this->runsOf($range));

        $one = $own->first();
        $other = $inRuns->first();

        return [
            'own_steps' => (int) ($one->steps ?? 0), 'own_runs' => (int) ($one->runs ?? 0),
            'runs_steps' => (int) ($other->steps ?? 0), 'runs_runs' => (int) ($other->runs ?? 0),
        ];
    }

    // Shared ---------------------------------------------------------------------------------------------------------

    /**
     * The ids of the runs that started in the range, of one agent or all, as a subquery.
     */
    private function runsOf(TimeRange $range, ?string $agent = null): \Closure
    {
        return function (Builder $runs) use ($range, $agent) {
            $runs->from('trail_traces')->select('id');
            $range->apply($runs, 'started_at');

            if ($agent !== null) {
                $runs->where('name', $agent);
            }
        };
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function rows(Builder $query): array
    {
        return array_map(fn (object $row) => (array) $row, $query->get()->all());
    }

    /**
     * The sum of a condition: how many rows meet it.
     *
     * @param  literal-string  $condition
     * @return literal-string
     */
    private static function countIf(string $condition): string
    {
        return 'sum(case when '.$condition.' then 1 else 0 end)';
    }
}
