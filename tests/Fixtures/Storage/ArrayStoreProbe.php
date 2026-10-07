<?php

namespace Astro\Trail\Tests\Fixtures\Storage;

use Astro\Trail\Storage\ArrayTraceStore;
use Astro\Trail\Storage\SpanRecord;
use DateTimeInterface;
use Illuminate\Support\Carbon;

class ArrayStoreProbe implements StoreProbe
{
    public function __construct(private readonly ArrayTraceStore $store) {}

    public function trace(string $id): ?array
    {
        $trace = $this->store->trace($id);
        $stored = $this->store->storedAt($id);
        $updated = $this->store->updatedAt($id);

        if ($trace === null || $stored === null || $updated === null) {
            return null;
        }

        $totals = $this->store->totals($id);

        return [
            'id' => $trace->id,
            'type' => $trace->type->value,
            'name' => $trace->name,
            'agent_class' => $trace->agentClass,
            'status' => $trace->status->value,
            'streamed' => $trace->streamed,
            'recovered' => $trace->recovered,
            'child_failed' => $trace->childFailed,
            'issue_kind' => $trace->issueKind?->value,
            'error_class' => $trace->errorClass,
            'error_message' => $trace->errorMessage,
            'error_source' => $trace->errorSource?->value,
            'error_http_status' => $trace->errorHttpStatus,
            'provider' => $trace->provider,
            'model' => $trace->model,
            'conversation_id' => $trace->conversationId,
            'user_id' => $trace->userId,
            'user_type' => $trace->userType,
            'input_tokens' => $totals->inputTokens,
            'output_tokens' => $totals->outputTokens,
            'cache_read_tokens' => $totals->cacheReadTokens,
            'cache_write_tokens' => $totals->cacheWriteTokens,
            'reasoning_tokens' => $totals->reasoningTokens,
            'cost' => $totals->cost,
            'span_count' => $totals->spanCount,
            'unpriced_span_count' => $totals->unpricedSpanCount,
            'duration_ms' => $trace->durationMs,
            'prompt_excerpt' => $trace->promptExcerpt,
            'response_excerpt' => $trace->responseExcerpt,
            'metadata' => $trace->metadata,
            'started_at' => $this->date($trace->startedAt),
            'ended_at' => $this->date($trace->endedAt),
            'created_at' => $this->date($stored),
            'updated_at' => $this->date($updated),
        ];
    }

    public function spans(string $traceId): array
    {
        return array_map(fn (SpanRecord $span) => $this->span($span), $this->store->spans($traceId));
    }

    public function traceCount(): int
    {
        return count($this->store->traces());
    }

    public function spanCount(): int
    {
        return count($this->store->spans());
    }

    /**
     * @return array<string, mixed>
     */
    private function span(SpanRecord $span): array
    {
        return [
            'id' => $span->id,
            'trace_id' => $span->traceId,
            'parent_id' => $span->parentId,
            'type' => $span->type->value,
            'name' => $span->name,
            'agent_class' => $span->agentClass,
            'status' => $span->status->value,
            'attempt' => $span->attempt,
            'sequence' => $span->sequence,
            'step_number' => $span->stepNumber,
            'provider' => $span->provider,
            'model' => $span->model,
            'responding_model' => $span->respondingModel,
            'input_tokens' => $span->inputTokens,
            'output_tokens' => $span->outputTokens,
            'cache_read_tokens' => $span->cacheReadTokens,
            'cache_write_tokens' => $span->cacheWriteTokens,
            'reasoning_tokens' => $span->reasoningTokens,
            'cost' => $span->cost,
            'input' => $span->input,
            'output' => $span->output,
            'metadata' => $span->metadata,
            'redacted' => $span->redacted,
            'truncated' => $span->truncated,
            'issue_kind' => $span->issueKind?->value,
            'error_class' => $span->errorClass,
            'error_message' => $span->errorMessage,
            'error_source' => $span->errorSource?->value,
            'error_http_status' => $span->errorHttpStatus,
            'duration_ms' => $span->durationMs,
            'started_at' => $this->date($span->startedAt),
            'ended_at' => $this->date($span->endedAt),
            'created_at' => $this->date($this->store->spanStoredAt($span->id)),
            'updated_at' => $this->date($this->store->spanUpdatedAt($span->id)),
        ];
    }

    private function date(?DateTimeInterface $moment): ?string
    {
        if ($moment === null) {
            return null;
        }

        $timezone = config('app.timezone');

        return Carbon::instance($moment)
            ->setTimezone(is_string($timezone) ? $timezone : 'UTC')
            ->format('Y-m-d H:i:s.v');
    }
}
