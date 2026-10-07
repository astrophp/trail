<?php

namespace Astro\Trail\Queries;

use Astro\Trail\Storage\Models\Span;
use Astro\Trail\Storage\Models\Trace;
use Illuminate\Database\Eloquent\Collection;

/**
 * The reads behind one run's page: the run, and its spans up to a limit.
 */
final class TraceDetail
{
    /** The most spans one response carries. */
    public const SPAN_LIMIT = 2000;

    /**
     * The run with every column, or null when there is no such run.
     */
    public function find(string $id): ?Trace
    {
        return Trace::query()->find($id);
    }

    /**
     * The first spans of the run in recording order. One more than the limit is read to learn
     * whether there are more; the count of all of them is only asked for then.
     *
     * @return array{spans: Collection<int, Span>, total: int, truncated: bool}
     */
    public function spans(Trace $trace): array
    {
        $spans = Span::query()->where('trace_id', $trace->id)
            ->orderBy('sequence')->orderBy('id')
            ->limit(self::SPAN_LIMIT + 1)->get();

        if ($spans->count() <= self::SPAN_LIMIT) {
            return ['spans' => $spans, 'total' => $spans->count(), 'truncated' => false];
        }

        return [
            'spans' => $spans->take(self::SPAN_LIMIT)->values(),
            'total' => Span::query()->where('trace_id', $trace->id)->count(),
            'truncated' => true,
        ];
    }
}
