<?php

namespace Astro\Trail\Http\Resources;

use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\Models\Span;
use Astro\Trail\Storage\TraceTotals;

/**
 * Where a run's tokens and money went, summed here so the client never adds any up. The rows and
 * the subtotals describe the spans given; the totals are the run's own and cover all of it.
 */
final class UsageBreakdown
{
    /**
     * @param  iterable<Span>  $spans  in recording order
     * @param  array<string, mixed>  $run  the run as TraceResource shapes it
     * @return array{totals: array{usage: mixed, cost: mixed}, rows: list<array<string, mixed>>, agents: list<array<string, mixed>>}
     */
    public static function of(iterable $spans, array $run): array
    {
        $byId = [];

        foreach ($spans as $span) {
            $byId[$span->id] = $span;
        }

        $rows = [];
        $owned = [];

        foreach ($byId as $span) {
            if (! SpanResource::usageOf($span)->contributes()) {
                continue;
            }

            $agent = self::agentOf($span, $byId);
            $rows[] = [
                'span_id' => $span->id,
                'agent_span_id' => $agent,
                'type' => $span->type->value,
                'name' => $span->name,
                'attempt' => $span->attempt,
                'step_number' => $span->step_number,
                'provider' => $span->provider,
                'model' => $span->model,
                'usage' => SpanResource::usage($span),
                'cost' => SpanResource::cost($span),
            ];

            if ($agent !== null) {
                $owned[$agent][] = SpanResource::usageOf($span);
            }
        }

        $agents = [];

        foreach ($byId as $span) {
            if ($span->type !== SpanType::Agent) {
                continue;
            }

            $totals = TraceTotals::of($owned[$span->id] ?? []);
            $running = $span->effectiveStatus() === Status::Running;

            $agents[] = [
                'span_id' => $span->id,
                'name' => $span->name,
                'usage' => Usage::of($running, $totals->inputTokens, $totals->outputTokens, $totals->cacheReadTokens, $totals->cacheWriteTokens, $totals->reasoningTokens),
                'cost' => Cost::of($totals->cost, $totals->unpricedSpanCount, $running),
            ];
        }

        return ['totals' => ['usage' => $run['usage'], 'cost' => $run['cost']], 'rows' => $rows, 'agents' => $agents];
    }

    /**
     * The nearest ancestor that is an agent span, looking only among the given spans. Null when
     * there is none, when the chain leaves them, or when it loops.
     *
     * @param  array<string, Span>  $spans
     */
    private static function agentOf(Span $span, array $spans): ?string
    {
        $seen = [$span->id => true];
        $parentId = $span->parent_id;

        while ($parentId !== null && ! isset($seen[$parentId])) {
            $parent = $spans[$parentId] ?? null;

            if ($parent === null) {
                return null;
            }

            if ($parent->type === SpanType::Agent) {
                return $parent->id;
            }

            $seen[$parentId] = true;
            $parentId = $parent->parent_id;
        }

        return null;
    }
}
