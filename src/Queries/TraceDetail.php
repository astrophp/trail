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

    /** The name of the helper column that ranks a run's spans. */
    private const PLACE = 'trail_place';

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

    /**
     * The first spans of each run in recording order, for any number of runs in one read. Each run
     * is ranked by the database and cut at one past the limit, so a run with a great many spans
     * costs no more than the limit; the count of all of them is asked for only the runs that went
     * past it, in one more. For one run spans() is the cheaper read, since it needs no ranking, and
     * a run's own page keeps using it.
     *
     * @param  iterable<Trace>  $traces
     * @return array<string, array{spans: Collection<int, Span>, total: int, truncated: bool}> by run id
     */
    public function spansOf(iterable $traces): array
    {
        $ids = [];

        foreach ($traces as $trace) {
            $ids[] = $trace->id;
        }

        if ($ids === []) {
            return [];
        }

        $table = (new Span)->getTable();

        // The place column is a helper of this read: it is dropped from every span before they leave.
        $ranked = Span::query()->toBase()->from($table)->select($table.'.*')
            ->selectRaw('row_number() over (partition by trace_id order by sequence, id) as '.self::PLACE)
            ->whereIn('trace_id', $ids);

        $rows = Span::query()->fromSub($ranked, $table)
            ->where(self::PLACE, '<=', self::SPAN_LIMIT + 1)
            ->orderBy('trace_id')->orderBy(self::PLACE)
            ->get();

        $found = [];

        foreach ($rows as $span) {
            $span->offsetUnset(self::PLACE);
            $found[$span->trace_id][] = $span;
        }

        $past = array_keys(array_filter($found, fn (array $spans): bool => count($spans) > self::SPAN_LIMIT));
        $totals = $past === [] ? [] : Span::query()->toBase()->whereIn('trace_id', $past)
            ->select('trace_id')->selectRaw('count(*) as total')->groupBy('trace_id')
            ->pluck('total', 'trace_id')->all();

        $pages = [];

        foreach ($ids as $id) {
            $spans = $found[$id] ?? [];
            $truncated = count($spans) > self::SPAN_LIMIT;
            $total = $truncated && is_numeric($totals[$id] ?? null) ? (int) $totals[$id] : count($spans);

            $pages[$id] = [
                'spans' => (new Span)->newCollection($truncated ? array_slice($spans, 0, self::SPAN_LIMIT) : $spans),
                'total' => $total,
                'truncated' => $truncated,
            ];
        }

        return $pages;
    }
}
