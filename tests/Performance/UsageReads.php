<?php

namespace Astro\Trail\Tests\Performance;

use Astro\Trail\Queries\OverviewQuery;
use Astro\Trail\Queries\RunScope;
use Astro\Trail\Queries\TimeRange;
use Astro\Trail\Storage\StaleRuns;
use Illuminate\Database\Connection;
use Illuminate\Database\Query\Builder;

/**
 * The candidate reads behind a usage page, one small method each: first on spans as they are, then
 * on the per-run summaries the store keeps (`trail_trace_models` and `trail_trace_tools`). They are plain SQL through the query builder with nothing vendor-specific.
 * None of them is part of the package: this is what the measurement times.
 *
 * Rows come back as arrays. "Billing" spans are the step and embedding spans, the ones that carry usage.
 */
final class UsageReads
{
    public const BILLING = ['step', 'embedding'];

    /** The tokens of a row, in the order the reads sum them. */
    public const TOKENS = ['input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'reasoning_tokens'];

    public function __construct(private readonly Connection $db) {}

    // A. Spans as they are -----------------------------------------------------------------------------------

    /**
     * The models of the range, for every agent: the select list of AgentBreakdown::modelsOf.
     *
     * @param  string  $runs  none (no run count), billing (distinct runs of billing spans) or any (distinct runs of any span with the model)
     * @return list<array<string, mixed>>
     */
    public function modelsOnSpans(TimeRange $range, string $runs): array
    {
        return $this->grouped($range, ['s.provider', 's.model'], $runs);
    }

    /**
     * @param  string  $runs  as for the models
     * @return list<array<string, mixed>>
     */
    public function providersOnSpans(TimeRange $range, string $runs): array
    {
        return $this->grouped($range, ['s.provider'], $runs);
    }

    /**
     * The same as the models, for each top-level agent (the run's name) through a join.
     *
     * @return list<array<string, mixed>>
     */
    public function agentModelsOnSpans(TimeRange $range): array
    {
        $query = $this->spans($range, joined: true)->select('t.name as run_name', 's.provider', 's.model');
        self::figures($query, 's', 'any');

        return self::rows($query->groupBy('t.name', 's.provider', 's.model'));
    }

    /**
     * Each top-level agent from its runs alone: no span is read.
     *
     * @return list<array<string, mixed>>
     */
    public function agentsOnTraces(TimeRange $range): array
    {
        $query = $this->db->table('trail_traces')->select('name')
            ->selectRaw('count(*) as runs')
            ->selectRaw('sum(input_tokens) as input_tokens')
            ->selectRaw('sum(output_tokens) as output_tokens')
            ->selectRaw('sum(cache_read_tokens) as cache_read_tokens')
            ->selectRaw('sum(cache_write_tokens) as cache_write_tokens')
            ->selectRaw('sum(reasoning_tokens) as reasoning_tokens')
            ->selectRaw('sum(cost) as cost_sum')
            ->selectRaw('sum(unpriced_span_count) as unpriced_spans');
        $range->apply($query, 'started_at');

        return self::rows($query->groupBy('name'));
    }

    /**
     * Each top-level agent from the billing spans of its runs, through a join.
     *
     * @return list<array<string, mixed>>
     */
    public function agentsOnSpans(TimeRange $range): array
    {
        $query = $this->spans($range, joined: true, billing: true)->select('t.name');
        self::figures($query, 's', 'billing');

        return self::rows($query->groupBy('t.name'));
    }

    /**
     * Tokens of the billing spans per model and bucket of the run's start.
     *
     * @param  list<array<string, mixed>>  $cuts  the buckets, as BucketUnit::buckets makes them
     * @return list<array<string, mixed>>
     */
    public function bucketsOnSpans(TimeRange $range, array $cuts): array
    {
        [$slot, $bindings] = self::slot($cuts, 't.started_at');
        $query = $this->spans($range, joined: true, billing: true)
            ->selectRaw($slot.' as slot', $bindings)
            ->addSelect('s.provider', 's.model');
        self::tokens($query, 's.');

        return self::rows($query->groupBy('slot', 's.provider', 's.model'));
    }

    /**
     * The models PriceBook::knownModels() reads from the spans, unbounded by time.
     *
     * @return list<array<string, mixed>>
     */
    public function observedOnSpans(): array
    {
        return self::rows($this->db->table('trail_spans')->whereIn('type', self::BILLING)
            ->whereNotNull('provider')->whereNotNull('model')->distinct()->select('provider', 'model'));
    }

    /**
     * The tools called in the range by name, for every agent, as AgentBreakdown::tools reads them.
     *
     * @return list<array<string, mixed>>
     */
    public function toolsOnSpans(TimeRange $range): array
    {
        $runs = $this->db->table('trail_traces')->select('id');
        $range->apply($runs, 'started_at');

        $query = $this->db->table('trail_spans as s')->where('s.type', 'tool')
            ->where('s.started_at', '>=', StaleRuns::format($range->from))
            ->whereIn('s.trace_id', $runs)
            ->select('s.name')
            ->selectRaw('count(*) as calls')
            ->selectRaw("sum(case when s.status = 'failed' then 1 else 0 end) as failed")
            ->selectRaw('count(distinct s.trace_id) as runs');

        return self::rows($query->groupBy('s.name'));
    }

    /**
     * The whole range as the overview reads it today.
     */
    public function overview(TimeRange $range): object
    {
        return (new OverviewQuery)->read($range, RunScope::none());
    }

    // B. The per-run summaries ---------------------------------------------------------------------------------

    /**
     * @param  list<string>  $by  grouping columns of the summary
     * @param  string  $runs  rows (count(*), one row per run and model), distinct (count(distinct trace_id)) or first (the rows marked first for their provider)
     * @return list<array<string, mixed>>
     */
    public function modelsOnSummary(TimeRange $range, array $by, string $runs, ?string $agent = null): array
    {
        $query = $this->db->table('trail_trace_models')->select($by)
            ->selectRaw('sum(steps) as calls')
            ->selectRaw(match ($runs) {
                'distinct' => 'count(distinct trace_id) as runs',
                'first' => 'sum(case when provider_first then 1 else 0 end) as runs',
                default => 'count(*) as runs',
            });
        self::tokens($query, '');
        $query->selectRaw('sum(cost) as cost_sum')
            ->selectRaw('sum(unpriced_steps) as unpriced')
            ->whereNotNull('provider');
        $range->apply($query, 'started_at');

        if (in_array('model', $by, true)) {
            $query->whereNotNull('model');
        }

        if ($agent !== null) {
            $query->where('run_name', $agent);
        }

        return self::rows($query->groupBy($by));
    }

    /**
     * @param  list<array<string, mixed>>  $cuts
     * @return list<array<string, mixed>>
     */
    public function bucketsOnSummary(TimeRange $range, array $cuts): array
    {
        [$slot, $bindings] = self::slot($cuts, 'started_at');
        $query = $this->db->table('trail_trace_models')->selectRaw($slot.' as slot', $bindings)
            ->addSelect('provider', 'model')
            ->whereNotNull('provider')->whereNotNull('model')
            ->where('steps', '>', 0);
        self::tokens($query, '');
        $range->apply($query, 'started_at');

        return self::rows($query->groupBy('slot', 'provider', 'model'));
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function observedOnSummary(bool $billingOnly): array
    {
        $query = $this->db->table('trail_trace_models')->distinct()->select('provider', 'model')
            ->whereNotNull('provider')->whereNotNull('model');

        if ($billingOnly) {
            $query->where('steps', '>', 0);
        }

        return self::rows($query);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function toolsOnSummary(TimeRange $range, ?string $agent): array
    {
        $query = $this->db->table('trail_trace_tools')->select('name')
            ->selectRaw('sum(calls) as calls')
            ->selectRaw('sum(failed) as failed')
            ->selectRaw('count(*) as runs');
        $range->apply($query, 'started_at');

        if ($agent !== null) {
            $query->where('run_name', $agent);
        }

        return self::rows($query->groupBy('name'));
    }

    // Shared -----------------------------------------------------------------------------------------------------

    /**
     * @param  list<string>  $by
     * @return list<array<string, mixed>>
     */
    private function grouped(TimeRange $range, array $by, string $runs): array
    {
        $query = $this->spans($range, joined: false, billing: $runs !== 'any')->select($by);
        self::figures($query, 's', $runs);

        return self::rows($query->groupBy($by));
    }

    /**
     * The spans of the runs that started in the range: a semi-join on the runs, or a join.
     */
    private function spans(TimeRange $range, bool $joined, bool $billing = false): Builder
    {
        $query = $this->db->table('trail_spans as s')
            ->where('s.started_at', '>=', StaleRuns::format($range->from))
            ->whereNotNull('s.provider')->whereNotNull('s.model');

        if ($joined) {
            $query->join('trail_traces as t', 't.id', '=', 's.trace_id');
            $range->apply($query, 't.started_at');
        } else {
            $runs = $this->db->table('trail_traces')->select('id');
            $range->apply($runs, 'started_at');
            $query->whereIn('s.trace_id', $runs);
        }

        if ($billing) {
            $query->whereIn('s.type', self::BILLING);
        }

        return $query;
    }

    /**
     * The select list of AgentBreakdown::modelsOf, with the run count a variant asks for.
     *
     * @param  literal-string  $a  the alias of the spans
     */
    private static function figures(Builder $query, string $a, string $runs): void
    {
        $bills = "{$a}.type in ('step', 'embedding')";
        $reported = "({$a}.input_tokens is not null or {$a}.output_tokens is not null or {$a}.cache_read_tokens is not null or {$a}.cache_write_tokens is not null or {$a}.reasoning_tokens is not null)";

        $query->selectRaw("sum(case when {$bills} then 1 else 0 end) as calls");

        match ($runs) {
            'billing' => $query->selectRaw("count(distinct case when {$bills} then {$a}.trace_id end) as runs"),
            'any' => $query->selectRaw("count(distinct {$a}.trace_id) as runs"),
            default => null,
        };

        foreach (self::TOKENS as $token) {
            $query->selectRaw("sum(case when {$bills} then {$a}.{$token} end) as {$token}");
        }

        $query->selectRaw("sum(case when {$bills} then {$a}.cost end) as cost_sum")
            ->selectRaw("sum(case when {$bills} and {$a}.cost is null and {$reported} then 1 else 0 end) as unpriced")
            ->selectRaw("sum(case when {$bills} and {$a}.status = ? and {$a}.created_at >= ? then 1 else 0 end) as running", ['running', StaleRuns::cutoffColumn()]);
    }

    /**
     * The five token sums of a column.
     *
     * @param  string  $prefix  the alias of the table and a dot, or nothing
     */
    private static function tokens(Builder $query, string $prefix): void
    {
        foreach (self::TOKENS as $token) {
            $query->selectRaw("sum({$prefix}{$token}) as {$token}");
        }
    }

    /**
     * A run belongs to the first bucket whose end is after its start, as the overview has it.
     *
     * @param  list<array<string, mixed>>  $cuts
     * @return array{0: string, 1: list<mixed>}
     */
    private static function slot(array $cuts, string $column): array
    {
        $whens = [];
        $bindings = [];

        foreach (array_slice($cuts, 0, -1) as $index => $cut) {
            $whens[] = "when {$column} < ? then ?";
            array_push($bindings, StaleRuns::format($cut['to']), $index);
        }

        $bindings[] = count($cuts) - 1;

        return ['case '.implode(' ', $whens).' else ? end', $bindings];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function rows(Builder $query): array
    {
        return array_map(fn (object $row) => (array) $row, $query->get()->all());
    }
}
