<?php

namespace Astro\Trail\Queries;

use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Storage\StaleRuns;
use Illuminate\Database\Query\Builder;

/**
 * Which conversations the list shows and in what order: the runs that carry a conversation id,
 * grouped by it. Only the ids come from here; what a row says about its conversation is read for
 * those ids by Conversations.
 *
 * A time range picks conversations, not turns: a conversation is in the view when one of its
 * turns started in the range. The filters describe the conversation as a whole, so a turn outside
 * the range can satisfy them.
 */
final class ConversationIndex
{
    /**
     * A portable "rows without a value last", as TraceIndex does, ahead of the aggregate.
     *
     * @var array<string, array{value: string, nulls: ?string}>
     */
    private const SORTS = [
        'last_activity' => ['value' => 'max(started_at)', 'nulls' => null],
        'turns' => ['value' => 'count(*)', 'nulls' => null],
        'cost' => ['value' => 'sum(cost)', 'nulls' => 'case when sum(cost) is null then 1 else 0 end'],
    ];

    /**
     * The conversation ids of one page, in the list's order. An id is one of the group's spellings,
     * which only matters on a database that compares text without regard to case.
     *
     * @return list<string>
     */
    public function ids(TimeRange $range, ConversationFilters $filters, Page $page): array
    {
        $sort = self::SORTS[$filters->sort];
        $direction = $filters->descending ? 'desc' : 'asc';

        $query = $this->grouped($range, $filters)->select('conversation_id');

        if ($sort['nulls'] !== null) {
            $query->orderByRaw($sort['nulls']);
        }

        $ids = $query->orderByRaw($sort['value'].' '.$direction)
            ->orderBy('conversation_id', $direction)
            ->offset($page->offset())->limit($page->perPage)
            ->pluck('conversation_id');

        return array_values(array_filter($ids->all(), is_string(...)));
    }

    /**
     * How many conversations the range, the agent, the user and the search leave, and how many of
     * those have a failed or incomplete turn. Neither number depends on the failed filter, so they
     * describe the same view whichever tab is selected; the list shows one of them. Read in a single
     * query over one row for each conversation, which is flagged when it has such a turn.
     *
     * @return array{all: int, failed: int}
     */
    public function counts(TimeRange $range, ConversationFilters $filters): array
    {
        [$failed, $bindings] = $this->failedTurns();

        $grouped = $this->grouped($range, $filters, false)
            ->select('conversation_id')
            ->selectRaw("case when {$failed} > 0 then 1 else 0 end as has_failure", $bindings);

        $row = $grouped->newQuery()
            ->fromSub($grouped, 'conversations')
            ->selectRaw('count(*) as total, sum(has_failure) as failures')
            ->first();

        return [
            'all' => is_numeric($row?->total) ? (int) $row->total : 0,
            'failed' => is_numeric($row?->failures) ? (int) $row->failures : 0,
        ];
    }

    /**
     * One row for each conversation that passes the range and the filters. The failed filter is
     * left out when the counts ask for it, since they count what it would keep.
     */
    private function grouped(TimeRange $range, ConversationFilters $filters, bool $applyFailed = true): Builder
    {
        $table = (new Trace)->getTable();

        $query = $this->turns(Trace::query()->toBase())
            // Every turn of a conversation that has one in the range, so the totals cover it whole.
            ->whereIn('conversation_id', function (Builder $started) use ($range, $table) {
                $this->turns($started->from($table)->select('conversation_id'));
                $range->apply($started, 'started_at');
            })
            ->groupBy('conversation_id');

        if ($filters->agent !== null) {
            $query->havingRaw('sum(case when name = ? then 1 else 0 end) > 0', [$filters->agent]);
        }

        if ($filters->userId !== null && $filters->userType !== null) {
            $query->havingRaw('sum(case when user_id = ? and user_type = ? then 1 else 0 end) > 0', [$filters->userId, $filters->userType]);
        } elseif ($filters->userId !== null) {
            $query->havingRaw('sum(case when user_id = ? then 1 else 0 end) > 0', [$filters->userId]);
        }

        if ($filters->failed && $applyFailed) {
            [$failed, $bindings] = $this->failedTurns();

            $query->havingRaw("{$failed} > 0", $bindings);
        }

        if ($filters->search !== null) {
            $pattern = Contains::pattern($filters->search);

            $query->havingRaw(
                "sum(case when lower(conversation_id) like ? escape '!' or lower(user_id) like ? escape '!' or lower(prompt_excerpt) like ? escape '!' then 1 else 0 end) > 0",
                [$pattern, $pattern, $pattern],
            );
        }

        return $query;
    }

    /**
     * The number of a conversation's turns that are failed or incomplete: the one definition of a
     * failed conversation, for the filter and for the count. A running turn past the cutoff is
     * incomplete, by the same expression the status counts use.
     *
     * @return array{string, list<mixed>}
     */
    private function failedTurns(): array
    {
        return [
            'sum(case when status in (?, ?) or (status = ? and created_at < ?) then 1 else 0 end)',
            [Status::Failed->value, Status::Incomplete->value, Status::Running->value, StaleRuns::cutoffColumn()],
        ];
    }

    /**
     * A run without a conversation id is not a turn of any conversation. An empty id is the same.
     */
    private function turns(Builder $query): Builder
    {
        return $query->whereNotNull('conversation_id')->where('conversation_id', '!=', '');
    }
}
