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
     * How many conversations the list shows in all.
     */
    public function count(TimeRange $range, ConversationFilters $filters): int
    {
        $grouped = $this->grouped($range, $filters)->select('conversation_id');

        return $grouped->newQuery()->fromSub($grouped, 'conversations')->count();
    }

    /**
     * One row for each conversation that passes the range and the filters.
     */
    private function grouped(TimeRange $range, ConversationFilters $filters): Builder
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

        if ($filters->failed) {
            // A running turn past the cutoff is incomplete, by the same expression the status counts use.
            $query->havingRaw(
                'sum(case when status in (?, ?) or (status = ? and created_at < ?) then 1 else 0 end) > 0',
                [Status::Failed->value, Status::Incomplete->value, Status::Running->value, StaleRuns::cutoffColumn()],
            );
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
     * A run without a conversation id is not a turn of any conversation. An empty id is the same.
     */
    private function turns(Builder $query): Builder
    {
        return $query->whereNotNull('conversation_id')->where('conversation_id', '!=', '');
    }
}
