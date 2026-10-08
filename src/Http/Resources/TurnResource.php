<?php

namespace Astro\Trail\Http\Resources;

use Astro\Trail\Queries\TraceDetail;
use Astro\Trail\Storage\Models\Span;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Transcript\StitchSpan;
use Astro\Trail\Transcript\TurnStitcher;
use Illuminate\Database\Eloquent\Collection;

/**
 * A turn of a conversation as its transcript returns it: the run as every endpoint returns it,
 * and the messages its spans hold.
 */
final readonly class TurnResource
{
    public function __construct(private TraceResource $traces) {}

    /**
     * @param  Collection<int, Span>  $spans  the first spans of the turn
     * @return array<string, mixed>
     */
    public function toArray(Trace $trace, Collection $spans, int $total, bool $truncated): array
    {
        $run = $this->traces->toArray($trace);
        $detail = TraceDetailResource::of($trace);

        $stitchable = [];

        foreach ($spans as $span) {
            $stitchable[] = self::stitchable($span);
        }

        $pending = [];

        foreach ($detail['pending_approvals'] as $approval) {
            if (is_string($approval['tool_call_id'] ?? null)) {
                $pending[] = $approval['tool_call_id'];
            }
        }

        $transcript = TurnStitcher::stitch($stitchable, $trace->effectiveStatus()->value, $pending, $detail['resolved_tool_call_ids'], $truncated);

        return [
            'trace' => $run,
            'detail' => $detail,
            'root_span_id' => $transcript->rootSpanId,
            'shown_attempt' => $transcript->shownAttempt,
            'attempts' => $transcript->attempts,
            'messages_state' => $transcript->state,
            'messages_reason' => $transcript->reason,
            'history_count' => $transcript->historyCount,
            'messages' => array_map(
                fn (array $message): array => [...$message, 'truncated_paths' => (object) $message['truncated_paths']],
                $transcript->messages,
            ),
            'span_limit' => ['limit' => TraceDetail::SPAN_LIMIT, 'total' => $total, 'truncated' => $truncated],
        ];
    }

    private static function stitchable(Span $span): StitchSpan
    {
        $metadata = is_array($span->metadata) ? $span->metadata : [];

        return new StitchSpan(
            id: $span->id,
            parentId: $span->parent_id,
            type: $span->type->value,
            name: $span->name,
            agentClass: $span->agent_class,
            attempt: $span->attempt,
            sequence: $span->sequence,
            status: $span->effectiveStatus()->value,
            issueKind: $span->effectiveIssueKind()?->value,
            durationMs: $span->duration_ms,
            provider: $span->provider,
            model: $span->model,
            error: ErrorResource::of($span),
            input: $span->input,
            output: $span->output,
            redacted: $span->redacted,
            truncated: $span->truncated,
            truncatedPaths: SpanResource::truncatedLengths($metadata['truncated'] ?? null),
            pendingApprovals: TraceDetailResource::pendingApprovals($metadata['pending_approvals'] ?? null),
            resolvedToolCallIds: TraceDetailResource::strings($metadata['resolved_tool_call_ids'] ?? null),
        );
    }
}
