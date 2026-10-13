<?php

namespace Astro\Trail\Queries;

use Astro\Trail\Storage\SearchUnits;
use Astro\Trail\Storage\SpanSql;
use Astro\Trail\Storage\StaleRuns;
use Illuminate\Database\Query\Builder;

/** Search units stay independent of tokens, with historical assessment explicitly visible. */
final class UnitUsage
{
    /** @param literal-string $alias */
    public static function select(Builder $query, string $alias = ''): void
    {
        $query->selectRaw('count(*) as unit_rows');
        $prefix = $alias === '' ? '' : $alias.'.';
        foreach (['search_unit_calls', 'reported_search_unit_calls', 'unpriced_search_unit_calls', 'unknown_cost_calls', 'ambiguous_reranking_calls'] as $field) {
            $query->selectRaw("sum({$prefix}{$field}) as {$field}");
        }
        $outer = $alias === '' ? 'trail_trace_models' : $alias;
        $cutoff = StaleRuns::cutoffColumn();
        $billable = SpanSql::bills('stale_call');
        $query->selectRaw("sum({$prefix}incomplete_calls + (select count(*) from trail_spans as stale_call where stale_call.trace_id = {$outer}.trace_id and (stale_call.provider = {$outer}.provider or (stale_call.provider is null and {$outer}.provider is null)) and (stale_call.model = {$outer}.model or (stale_call.model is null and {$outer}.model is null)) and {$billable} and stale_call.status = 'running' and stale_call.created_at < ?)) as incomplete_calls", [$cutoff]);
        $query->selectRaw("sum(case when {$prefix}unknown_cost_calls is null then 1 else 0 end) as unassessed_rows");
        foreach (['search_units', 'unpriced_search_units'] as $field) {
            $column = $prefix.$field;
            $high = "sum(cast(floor({$column} / 1000000000000) as decimal(38, 0)))";
            $middle = "sum(cast(floor(({$column} % 1000000000000) / 1000000) as decimal(38, 0)))";
            $low = "sum(cast(({$column} % 1000000) as decimal(38, 0)))";
            $reported = $prefix.($field === 'search_units' ? 'reported_search_unit_calls' : 'unpriced_search_unit_calls');
            // An overflow or a missing unpriced quantity poisons the sum, rather than disappearing in SQL sum(null).
            $query->selectRaw("case when sum(case when {$reported} > 0 and {$column} is null then 1 else 0 end) = 0 and {$high} + floor(({$middle} + floor({$low} / 1000000)) / 1000000) <= 999999 then {$high} * 1000000000000 + {$middle} * 1000000 + {$low} end as {$field}");
        }
    }

    /** @return array<string, mixed> */
    public static function of(?object $row): array
    {
        if ($row === null || Row::int($row, 'unit_rows') === 0) {
            return ['assessment' => 'assessed', 'search_units' => null, 'search_unit_calls' => 0, 'reported_search_unit_calls' => 0, 'unpriced_search_unit_calls' => 0, 'unpriced_search_units' => '0.000000', 'unknown_cost_calls' => 0, 'incomplete_calls' => 0, 'ambiguous_reranking_calls' => 0];
        }
        $known = Row::nullableInt($row, 'unknown_cost_calls') !== null;
        $history = Row::int($row, 'unassessed_rows') > 0;
        $units = SearchUnits::fromStorage(Row::nullableInt($row, 'search_units'));
        $unpricedCalls = Row::nullableInt($row, 'unpriced_search_unit_calls');

        return [
            'assessment' => ! $known ? 'not_assessed' : ($history ? 'partial' : 'assessed'),
            'search_units' => $units,
            'search_unit_calls' => Row::nullableInt($row, 'search_unit_calls'),
            'reported_search_unit_calls' => Row::nullableInt($row, 'reported_search_unit_calls'),
            'unpriced_search_unit_calls' => $unpricedCalls,
            'unpriced_search_units' => $unpricedCalls === 0 ? '0.000000' : (SearchUnits::fromStorage(Row::nullableInt($row, 'unpriced_search_units'))),
            'unknown_cost_calls' => Row::nullableInt($row, 'unknown_cost_calls'),
            'incomplete_calls' => Row::nullableInt($row, 'incomplete_calls'),
            'ambiguous_reranking_calls' => Row::nullableInt($row, 'ambiguous_reranking_calls'),
        ];
    }
}
