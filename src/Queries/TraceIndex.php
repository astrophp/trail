<?php

namespace Astro\Trail\Queries;

use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\Models\Bookmark;
use Astro\Trail\Storage\Models\Span;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Storage\StaleRuns;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;

/**
 * The reads behind the list of runs.
 */
final class TraceIndex
{
    /** The most runs an export writes: the first ones in the list's order. */
    public const EXPORT_LIMIT = 10000;

    /** How many runs an export reads at a time. */
    public const EXPORT_CHUNK = 500;

    /** The share of runs a "slow" run is at or above. */
    private const SLOW_PERCENTILE = 95;

    /** What the list reads of a run: not its error text or metadata, which can be large and are not listed. */
    private const COLUMNS = [
        'id', 'type', 'name', 'agent_class', 'status', 'streamed', 'recovered', 'child_failed', 'issue_kind',
        'provider', 'model', 'conversation_id', 'user_id', 'user_type',
        'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'reasoning_tokens',
        'cost', 'span_count', 'unpriced_span_count', 'duration_ms', 'prompt_excerpt', 'response_excerpt',
        'started_at', 'ended_at', 'created_at',
    ];

    /**
     * Escaped with `!`, which all three databases accept in an ESCAPE clause (a backslash is not an
     * escape character in SQLite). The columns are listed as SQL so that none is ever user input.
     */
    private const SEARCHED = [
        "lower(id) like ? escape '!'",
        "lower(name) like ? escape '!'",
        "lower(provider) like ? escape '!'",
        "lower(model) like ? escape '!'",
        "lower(prompt_excerpt) like ? escape '!'",
        "lower(conversation_id) like ? escape '!'",
        "lower(user_id) like ? escape '!'",
    ];

    /**
     * Postgres sorts nulls first when descending and MySQL and SQLite when ascending, so a run
     * without the value is put last by a portable expression ahead of the column.
     *
     * @var array<string, array{column: string, nulls: ?string}>
     */
    private const SORTS = [
        'started_at' => ['column' => 'started_at', 'nulls' => null],
        'duration' => ['column' => 'duration_ms', 'nulls' => 'case when duration_ms is null then 1 else 0 end'],
        'cost' => ['column' => 'cost', 'nulls' => 'case when cost is null then 1 else 0 end'],
        'agent' => ['column' => 'name', 'nulls' => null],
    ];

    /**
     * @param  int  $exportLimit  the most runs an export writes
     */
    public function __construct(private readonly int $exportLimit = self::EXPORT_LIMIT) {}

    public function exportLimit(): int
    {
        return $this->exportLimit;
    }

    /**
     * The duration "slow" compares against: the nearest-rank 95th percentile of the runs in the
     * range that have a duration, whatever the other filters. Null when none has.
     */
    public function slowThreshold(TimeRange $range): ?float
    {
        $query = Trace::query()->whereNotNull('duration_ms');
        $range->apply($query, 'started_at');

        $count = $query->count();

        if ($count === 0) {
            return null;
        }

        $rank = intdiv(self::SLOW_PERCENTILE * $count + 99, 100);
        $duration = $query->orderBy('duration_ms')->offset($rank - 1)->limit(1)->value('duration_ms');

        return is_numeric($duration) ? (float) $duration : null;
    }

    /**
     * How many runs pass every filter except the status, by the status they show.
     *
     * @return array{all: int, completed: int, failed: int, incomplete: int, running: int, awaiting_approval: int}
     */
    public function statusCounts(TimeRange $range, TraceFilters $filters, ?float $slowThreshold): array
    {
        // One pass: each stored status, and how many of its runs are past the stale cutoff.
        $rows = $this->filtered($range, $filters, $slowThreshold, withStatus: false)
            ->toBase()
            ->select('status')
            ->selectRaw('count(*) as total')
            ->selectRaw('sum(case when created_at < ? then 1 else 0 end) as stale', [StaleRuns::cutoffColumn()])
            ->groupBy('status')
            ->get()
            ->keyBy('status');

        $number = fn (Status $status, string $column): int => is_numeric($value = $rows->get($status->value)?->{$column}) ? (int) $value : 0;
        $count = fn (Status $status): int => $number($status, 'total');
        $stale = $number(Status::Running, 'stale');

        $counts = [
            'completed' => $count(Status::Completed),
            'failed' => $count(Status::Failed),
            'incomplete' => $count(Status::Incomplete) + $stale,
            'running' => max(0, $count(Status::Running) - $stale),
            'awaiting_approval' => $count(Status::AwaitingApproval),
        ];

        return ['all' => array_sum($counts)] + $counts;
    }

    /**
     * @return Collection<int, Trace>
     */
    public function rows(TimeRange $range, TraceFilters $filters, ?float $slowThreshold, Page $page): Collection
    {
        return $this->ordered($range, $filters, $slowThreshold)
            ->offset($page->offset())->limit($page->perPage)->get();
    }

    /**
     * How many runs the list shows for these filters, the status included. When $ids is given only
     * those runs count.
     *
     * @param  list<string>|null  $ids
     */
    public function count(TimeRange $range, TraceFilters $filters, ?float $slowThreshold, ?array $ids = null): int
    {
        return $this->filtered($range, $filters, $slowThreshold, withStatus: true, ids: $ids)->count();
    }

    /**
     * A slice of the list in the list's own order, for an export that reads it piece by piece.
     *
     * @param  list<string>|null  $ids  keep only these runs
     * @return Collection<int, Trace>
     */
    public function slice(TimeRange $range, TraceFilters $filters, ?float $slowThreshold, ?array $ids, int $offset, int $limit): Collection
    {
        return $this->ordered($range, $filters, $slowThreshold, $ids)->offset($offset)->limit($limit)->get();
    }

    /**
     * The runs of the list in its order: the sort, then the id in the same direction so that
     * runs equal on the sorted column keep one order from page to page.
     *
     * @param  list<string>|null  $ids
     * @return Builder<Trace>
     */
    private function ordered(TimeRange $range, TraceFilters $filters, ?float $slowThreshold, ?array $ids = null): Builder
    {
        $sort = self::SORTS[$filters->sort];
        $direction = $filters->descending ? 'desc' : 'asc';
        $query = $this->filtered($range, $filters, $slowThreshold, withStatus: true, ids: $ids)->select(self::COLUMNS);

        if ($sort['nulls'] !== null) {
            $query->orderByRaw($sort['nulls']);
        }

        return $query->orderBy($sort['column'], $direction)->orderBy('id', $direction);
    }

    /**
     * The runs the list shows just before and just after a run, in the same view and sort. Null
     * when there is no such run; a run the view does not hold has neither neighbour.
     *
     * Two reads at most beyond that: whether the run is in the view, then one row for each
     * neighbour. The run's own sort value is compared inside the database, never bound from PHP,
     * so equality and order are decided on the stored values and the column's collation.
     *
     * @return array{previous: ?string, next: ?string}|null
     */
    public function neighbours(string $id, TimeRange $range, TraceFilters $filters, ?float $slowThreshold): ?array
    {
        $sort = self::SORTS[$filters->sort];
        $nullable = $sort['nulls'] !== null;

        $pivot = $this->filtered($range, $filters, $slowThreshold, withStatus: true)
            ->whereKey($id)
            ->toBase()
            ->select('id')
            ->when($nullable, fn ($query) => $query->selectRaw('case when '.$sort['column'].' is null then 1 else 0 end as missing'))
            ->first();

        if ($pivot === null) {
            return Trace::query()->whereKey($id)->exists() ? ['previous' => null, 'next' => null] : null;
        }

        // The id as stored, which a case-insensitive collation may spell differently from the request.
        $pivotId = is_string($pivot->id) ? $pivot->id : $id;
        $missing = $nullable && is_numeric($pivot->missing ?? null) && (int) $pivot->missing === 1;

        return [
            'previous' => $this->neighbour($range, $filters, $slowThreshold, $pivotId, $missing, after: false),
            'next' => $this->neighbour($range, $filters, $slowThreshold, $pivotId, $missing, after: true),
        ];
    }

    /**
     * The first run strictly after (or before) the pivot in the list's order: runs with the value
     * first, by the column in its direction, then the id in the same direction, then runs without.
     */
    private function neighbour(TimeRange $range, TraceFilters $filters, ?float $slowThreshold, string $pivotId, bool $missing, bool $after): ?string
    {
        $sort = self::SORTS[$filters->sort];
        $nullable = $sort['nulls'] !== null;
        $table = (new Trace)->getTable();
        $column = $table.'.'.$sort['column'];
        $key = $table.'.id';
        // Past the pivot in the list's direction, or before it when looking back.
        $beyond = $after === ! $filters->descending ? '>' : '<';

        $value = fn () => Trace::query()->toBase()->from($table.' as pivot')->select('pivot.'.$sort['column'])->where('pivot.id', $pivotId);

        $query = $this->filtered($range, $filters, $slowThreshold, withStatus: true);

        $query->where(function (Builder $query) use ($nullable, $column, $key, $beyond, $value, $pivotId, $missing, $after) {
            if ($missing) {
                // Runs without the value form the last group, ordered by id.
                $after
                    ? $query->whereNull($column)->where($key, $beyond, $pivotId)
                    : $query->whereNotNull($column)->orWhere(fn (Builder $tied) => $tied->whereNull($column)->where($key, $beyond, $pivotId));

                return;
            }

            $query->where($column, $beyond, $value())
                ->orWhere(fn (Builder $tied) => $tied->where($column, '=', $value())->where($key, $beyond, $pivotId));

            if ($nullable && $after) {
                $query->orWhereNull($column);
            }
        });

        if ($sort['nulls'] !== null) {
            $query->orderByRaw($sort['nulls'].($after ? '' : ' desc'));
        }

        $direction = $beyond === '>' ? 'asc' : 'desc';
        $id = $query->orderBy($column, $direction)->orderBy($key, $direction)->limit(1)->value($key);

        return is_string($id) ? $id : null;
    }

    /**
     * @param  list<string>|null  $ids  keep only these runs
     * @return Builder<Trace>
     */
    private function filtered(TimeRange $range, TraceFilters $filters, ?float $slowThreshold, bool $withStatus, ?array $ids = null): Builder
    {
        $query = Trace::query();
        $range->apply($query, 'started_at');

        if ($ids !== null) {
            $query->whereIn('id', $ids);
        }

        if ($withStatus && $filters->status !== null) {
            $query->whereEffectiveStatus($filters->status);
        }

        if ($filters->issueKind !== null) {
            $query->whereEffectiveIssueKind($filters->issueKind);
        }

        $query->when($filters->agent !== null, fn (Builder $query) => $query->where('name', $filters->agent))
            ->when($filters->conversation !== null, fn (Builder $query) => $query->where('conversation_id', $filters->conversation))
            ->when($filters->userId !== null, fn (Builder $query) => $query->where('user_id', $filters->userId))
            ->when($filters->userType !== null, fn (Builder $query) => $query->where('user_type', $filters->userType))
            ->when($filters->streamed, fn (Builder $query) => $query->where('streamed', true))
            ->when($filters->recovered, fn (Builder $query) => $query->where('recovered', true))
            ->when($filters->childFailed, fn (Builder $query) => $query->where('child_failed', true))
            ->when($filters->unpriced, fn (Builder $query) => $query->where('unpriced_span_count', '>', 0))
            ->when($filters->bookmarked, fn (Builder $query) => $query->whereIn('id', Bookmark::query()->select('trace_id')));

        if ($filters->provider !== null || $filters->model !== null) {
            // Any step of the run, and the same step for both. A step never starts before its run,
            // so the range's start bounds the steps (it has no end: a step can outlast the range).
            $query->whereIn('id', Span::query()->select('trace_id')
                ->where('started_at', '>=', StaleRuns::format($range->from))
                ->when($filters->provider !== null, fn (Builder $spans) => $spans->where('provider', $filters->provider))
                ->when($filters->model !== null, fn (Builder $spans) => $spans->where('model', $filters->model)));
        }

        if ($filters->slow) {
            $slowThreshold === null
                ? $query->whereRaw('1 = 0')
                : $query->where('duration_ms', '>=', $slowThreshold);
        }

        if ($filters->search !== null) {
            $this->search($query, $filters->search);
        }

        return $query;
    }

    /**
     * Case-insensitive "contains" over the run's text columns, the term taken literally.
     *
     * @param  Builder<Trace>  $query
     */
    private function search(Builder $query, string $term): void
    {
        $pattern = Contains::pattern($term);

        $query->where(function (Builder $query) use ($pattern) {
            foreach (self::SEARCHED as $condition) {
                $query->orWhereRaw($condition, [$pattern]);
            }
        });
    }
}
