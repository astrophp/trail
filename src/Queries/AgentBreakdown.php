<?php

namespace Astro\Trail\Queries;

use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\Models\Span;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Storage\StaleRuns;
use Illuminate\Database\Query\Builder;
use Illuminate\Database\Query\JoinClause;

/**
 * The models and tools an agent used in a range. Each read is one grouped read over spans, and
 * returns every group: the endpoint keeps the first few and says how many there are.
 *
 * "Of its runs" means every span of the runs the agent started in the range (its top-level
 * runs), the spans of the agents it delegated to included. "Of its delegated runs" means the
 * steps and tools that are children of its agent spans that have a parent.
 *
 * The span reads are bounded by the start of the range, which a span never precedes its run in,
 * as the runs list bounds its model and tool filters.
 */
final class AgentBreakdown
{
    /**
     * The model calls of the agent's runs by provider and model: the step spans, and the embeddings
     * spans, since the runs list's provider and model filters match any span that used the model.
     *
     * @return list<object> provider, model, calls, runs, token sums, cost_sum, unpriced, running
     */
    public function models(string $name, TimeRange $range): array
    {
        return $this->modelsOf($this->spansOfRuns($name, $range), 'trail_spans');
    }

    /**
     * @return list<object> name, calls, failed, runs
     */
    public function tools(string $name, TimeRange $range): array
    {
        return $this->toolsOf($this->spansOfRuns($name, $range), 'trail_spans');
    }

    /**
     * The model calls made inside the agent's delegated runs: its children of agent spans with a parent.
     *
     * @return list<object>
     */
    public function delegatedModels(string $name, TimeRange $range): array
    {
        return $this->modelsOf($this->childrenOfDelegated($name, $range), 'c');
    }

    /**
     * @return list<object>
     */
    public function delegatedTools(string $name, TimeRange $range): array
    {
        return $this->toolsOf($this->childrenOfDelegated($name, $range), 'c');
    }

    /**
     * @param  literal-string  $alias  what the spans being counted are called in the query
     * @return list<object>
     */
    private function modelsOf(Builder $spans, string $alias): array
    {
        $running = Status::Running->value;
        $cutoff = StaleRuns::cutoffColumn();
        $reported = "({$alias}.input_tokens is not null or {$alias}.output_tokens is not null or {$alias}.cache_read_tokens is not null or {$alias}.cache_write_tokens is not null or {$alias}.reasoning_tokens is not null)";

        return array_values($spans
            ->whereIn("{$alias}.type", [SpanType::Step->value, SpanType::Embedding->value])
            ->whereNotNull("{$alias}.provider")->whereNotNull("{$alias}.model")
            ->select("{$alias}.provider", "{$alias}.model")
            ->selectRaw('count(*) as calls')
            ->selectRaw("count(distinct {$alias}.trace_id) as runs")
            ->selectRaw("sum({$alias}.input_tokens) as input_tokens")
            ->selectRaw("sum({$alias}.output_tokens) as output_tokens")
            ->selectRaw("sum({$alias}.cache_read_tokens) as cache_read_tokens")
            ->selectRaw("sum({$alias}.cache_write_tokens) as cache_write_tokens")
            ->selectRaw("sum({$alias}.reasoning_tokens) as reasoning_tokens")
            ->selectRaw("sum({$alias}.cost) as cost_sum")
            // A step that reported usage and could not be priced, as a run's unpriced count has it.
            ->selectRaw("sum(case when {$alias}.cost is null and {$reported} then 1 else 0 end) as unpriced")
            ->selectRaw("sum(case when {$alias}.status = ? and {$alias}.created_at >= ? then 1 else 0 end) as running", [$running, $cutoff])
            ->groupBy("{$alias}.provider", "{$alias}.model")
            ->orderByRaw("count(distinct {$alias}.trace_id) desc")
            ->orderBy("{$alias}.provider")->orderBy("{$alias}.model")
            ->get()->all());
    }

    /**
     * @param  literal-string  $alias
     * @return list<object>
     */
    private function toolsOf(Builder $spans, string $alias): array
    {
        return array_values($spans
            ->where("{$alias}.type", SpanType::Tool->value)
            ->select("{$alias}.name")
            ->selectRaw('count(*) as calls')
            ->selectRaw("sum(case when {$alias}.status = ? then 1 else 0 end) as failed", [Status::Failed->value])
            ->selectRaw("count(distinct {$alias}.trace_id) as runs")
            ->groupBy("{$alias}.name")
            ->orderByRaw("count(distinct {$alias}.trace_id) desc")
            ->orderBy("{$alias}.name")
            ->get()->all());
    }

    /**
     * The spans of the runs of that name that started in the range.
     */
    private function spansOfRuns(string $name, TimeRange $range): Builder
    {
        $runs = Trace::query()->toBase()->select('id')->where('name', $name);
        $range->apply($runs, 'started_at');

        return Span::query()->toBase()->from('trail_spans')
            ->where('trail_spans.started_at', '>=', StaleRuns::format($range->from))
            ->whereIn('trail_spans.trace_id', $runs);
    }

    /**
     * The children of the agent's agent spans that have a parent, in runs that started in the
     * range. The join also matches on the run, so that the index on (trace_id, started_at) serves it.
     */
    private function childrenOfDelegated(string $name, TimeRange $range): Builder
    {
        $runs = Trace::query()->toBase()->select('id');
        $range->apply($runs, 'started_at');

        return Span::query()->toBase()->from('trail_spans as c')
            ->join('trail_spans as a', fn (JoinClause $join) => $join->on('c.parent_id', '=', 'a.id')->on('c.trace_id', '=', 'a.trace_id'))
            ->where('a.type', SpanType::Agent->value)
            ->where('a.name', $name)
            ->whereNotNull('a.parent_id')
            ->where('a.started_at', '>=', StaleRuns::format($range->from))
            ->whereIn('a.trace_id', $runs);
    }
}
