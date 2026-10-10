<?php

namespace Astro\Trail\Http\Resources;

use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\Models\Span;
use Astro\Trail\Storage\SpanUsage;
use Illuminate\Support\Carbon;

/**
 * A span as the run's endpoint returns it: one shape for every type. Usage and cost are those of
 * the span itself and only exist on the types that bill; they are `null` on the others.
 */
final readonly class SpanResource
{
    /** @param Carbon $runStartedAt when the run started, which the span's offset counts from */
    public function __construct(private Carbon $runStartedAt) {}

    /**
     * @param  iterable<Span>  $spans
     * @return list<array<string, mixed>>
     */
    public function collection(iterable $spans): array
    {
        $items = [];

        foreach ($spans as $span) {
            $items[] = $this->toArray($span);
        }

        return $items;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Span $span): array
    {
        $metadata = is_array($span->metadata) ? $span->metadata : [];
        $paths = $metadata['truncated'] ?? null;
        unset($metadata['truncated']);

        return [
            'id' => $span->id,
            'parent_id' => $span->parent_id,
            'type' => $span->type->value,
            'name' => $span->name,
            'agent_class' => $span->agent_class,
            'status' => $span->effectiveStatus()->value,
            'issue_kind' => $span->effectiveIssueKind()?->value,
            'attempt' => $span->attempt,
            'sequence' => $span->sequence,
            'step_number' => $span->step_number,
            'provider' => $span->provider,
            'model' => $span->model,
            'responding_model' => $span->responding_model,
            'duration_ms' => $span->duration_ms,
            'offset_ms' => $this->offset($span),
            'started_at' => Timestamp::format($span->started_at),
            'ended_at' => Timestamp::format($span->ended_at),
            'usage' => self::usage($span),
            'cost' => self::cost($span),
            'error' => ErrorResource::of($span),
            'input' => $span->input,
            'output' => $span->output,
            'metadata' => $metadata === [] ? null : $metadata,
            'redacted' => $span->redacted,
            'truncated' => $span->truncated,
            'truncated_paths' => self::truncatedPaths($paths),
        ];
    }

    /**
     * What the span used, or null on a span that does not bill.
     *
     * @return array<string, mixed>|null
     */
    public static function usage(Span $span): ?array
    {
        if (! self::usageOf($span)->contributes()) {
            return null;
        }

        return Usage::of(self::running($span), $span->input_tokens, $span->output_tokens, $span->cache_read_tokens, $span->cache_write_tokens, $span->reasoning_tokens);
    }

    /**
     * What the span cost, or null on a span that does not bill. A span is priced whole, so its cost
     * is never partial.
     *
     * @return array{state: string, amount: ?float}|null
     */
    public static function cost(Span $span): ?array
    {
        $usage = self::usageOf($span);

        if (! $usage->contributes()) {
            return null;
        }

        return Cost::of($span->cost, $span->cost === null && $usage->reportedUsage() ? 1 : 0, self::running($span));
    }

    public static function usageOf(Span $span): SpanUsage
    {
        return new SpanUsage($span->type, $span->input_tokens, $span->output_tokens, $span->cache_read_tokens, $span->cache_write_tokens, $span->reasoning_tokens, $span->cost);
    }

    private static function running(Span $span): bool
    {
        return $span->effectiveStatus() === Status::Running;
    }

    /**
     * Milliseconds from the start of the run to the start of the span, signed: a span recorded
     * after the fact can start a hair before the run does.
     */
    private function offset(Span $span): int
    {
        return (int) round($span->started_at->getPreciseTimestamp(3) - $this->runStartedAt->getPreciseTimestamp(3));
    }

    /**
     * The original lengths of the cut payload paths, always an object.
     */
    private static function truncatedPaths(mixed $paths): object
    {
        return (object) self::truncatedLengths($paths);
    }

    /**
     * The original lengths of the cut payload paths a span's metadata holds, by path.
     *
     * @return array<string, int>
     */
    public static function truncatedLengths(mixed $paths): array
    {
        $lengths = [];

        if (is_array($paths)) {
            foreach ($paths as $path => $length) {
                if (is_int($length)) {
                    $lengths[(string) $path] = $length;
                }
            }
        }

        return $lengths;
    }
}
