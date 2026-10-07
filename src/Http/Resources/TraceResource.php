<?php

namespace Astro\Trail\Http\Resources;

use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\Models\Bookmark;
use Astro\Trail\Storage\Models\Trace;

/**
 * A run as every endpoint returns it. Built for a set of runs, so the users and the bookmarks of
 * the whole set cost one lookup each however many runs it holds; a single run is a set of one.
 */
final readonly class TraceResource
{
    /**
     * @param  array<string, true>  $bookmarked  the ids of the bookmarked runs
     */
    public function __construct(private ResolvedUsers $users, private array $bookmarked) {}

    /**
     * @param  iterable<Trace>  $traces
     */
    public static function of(iterable $traces): self
    {
        $ids = [];
        $pairs = [];

        foreach ($traces as $trace) {
            $ids[] = $trace->id;
            $pairs[] = [$trace->user_type, $trace->user_id];
        }

        $bookmarked = [];

        if ($ids !== []) {
            foreach (Bookmark::query()->whereIn('trace_id', $ids)->get(['trace_id']) as $bookmark) {
                $bookmarked[$bookmark->trace_id] = true;
            }
        }

        return new self(ResolvedUsers::of($pairs), $bookmarked);
    }

    /**
     * @param  iterable<Trace>  $traces
     * @return list<array<string, mixed>>
     */
    public function collection(iterable $traces): array
    {
        $items = [];

        foreach ($traces as $trace) {
            $items[] = $this->toArray($trace);
        }

        return $items;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Trace $trace): array
    {
        $status = $trace->effectiveStatus();
        $running = $status === Status::Running;

        return [
            'id' => $trace->id,
            'type' => $trace->type->value,
            'name' => $trace->name,
            'agent_class' => $trace->agent_class,
            'status' => $status->value,
            'issue_kind' => $trace->effectiveIssueKind()?->value,
            'streamed' => $trace->streamed,
            'recovered' => $trace->recovered,
            'child_failed' => $trace->child_failed,
            'provider' => $trace->provider,
            'model' => $trace->model,
            'duration_ms' => $trace->duration_ms,
            'usage' => Usage::of($running, $trace->input_tokens, $trace->output_tokens, $trace->cache_read_tokens, $trace->cache_write_tokens, $trace->reasoning_tokens),
            'cost' => Cost::of($trace->cost, $trace->unpriced_span_count, $running),
            'span_count' => $trace->span_count,
            'prompt_excerpt' => $trace->prompt_excerpt,
            'response_excerpt' => $trace->response_excerpt,
            'conversation_id' => $trace->conversation_id,
            'user' => $this->users->get($trace->user_type, $trace->user_id),
            'bookmarked' => isset($this->bookmarked[$trace->id]),
            'started_at' => Timestamp::format($trace->started_at),
            'ended_at' => Timestamp::format($trace->ended_at),
        ];
    }
}
