<?php

namespace Astro\Trail\Queries;

use Astro\Trail\Enums\SpanType;
use Astro\Trail\Storage\Models\Span;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Storage\StaleRuns;
use Illuminate\Database\Query\Builder;

/**
 * Whether an agent was ever recorded, and how it is written, without reading its figures. The
 * name is compared as the database compares text. Each lookup is at most two reads: its latest run
 * (a run of the name), then its latest delegated span (an agent span of the name with a parent,
 * which the index on the span's type and name finds).
 */
final class AgentLookup
{
    /**
     * The agent as written by its latest run in the range, else by its latest delegated span in the
     * range; null when it has neither there.
     */
    public function inRange(string $name, TimeRange $range): ?AgentIdentity
    {
        $runs = Trace::query()->toBase()->where('name', $name);
        $range->apply($runs, 'started_at');

        $inRange = Trace::query()->toBase()->select('id');
        $range->apply($inRange, 'started_at');

        $spans = Span::query()->toBase()->where('type', SpanType::Agent->value)->where('name', $name)->whereNotNull('parent_id')
            ->where('started_at', '>=', StaleRuns::format($range->from))
            ->whereIn('trace_id', $inRange);

        return $this->latestRun($runs) ?? $this->latestSpan($spans);
    }

    /**
     * The agent as written by its latest run in any range, else by its latest delegated span; null
     * when no run and no delegated span of that name was ever recorded.
     */
    public function ever(string $name): ?AgentIdentity
    {
        $runs = Trace::query()->toBase()->where('name', $name);
        $spans = Span::query()->toBase()->where('type', SpanType::Agent->value)->where('name', $name)->whereNotNull('parent_id');

        return $this->latestRun($runs) ?? $this->latestSpan($spans);
    }

    private function latestRun(Builder $runs): ?AgentIdentity
    {
        $row = $runs->select('name', 'agent_class', 'type')->orderByDesc('started_at')->orderByDesc('id')->first();

        return $row === null ? null : new AgentIdentity(Row::string($row, 'name'), Row::nullableString($row, 'agent_class'), SpanType::tryFrom(Row::string($row, 'type')) ?? SpanType::Agent);
    }

    private function latestSpan(Builder $spans): ?AgentIdentity
    {
        $row = $spans->select('name', 'agent_class')->orderByDesc('started_at')->orderByDesc('id')->first();

        return $row === null ? null : new AgentIdentity(Row::string($row, 'name'), Row::nullableString($row, 'agent_class'), SpanType::Agent);
    }
}
