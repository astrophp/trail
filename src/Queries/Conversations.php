<?php

namespace Astro\Trail\Queries;

use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Storage\StaleRuns;
use DateTimeImmutable;
use DateTimeZone;
use Illuminate\Database\Query\Builder;

/**
 * What the list of conversations says about a set of them, read in a fixed number of queries
 * whatever the set holds: the totals, the latest turn, the distinct agents and the distinct users.
 * Every figure covers all of a conversation's turns, whatever the time range of the list.
 */
final class Conversations
{
    /** The most agent names a conversation lists; its agent count is the real one. */
    public const AGENT_CAP = 5;

    /** The most users a conversation lists; its user count is the real one. */
    public const USER_CAP = 3;

    /**
     * @param  list<string>  $ids  conversation ids, as the list gave them
     * @return list<ConversationSummary> in the order of $ids
     */
    public function summaries(array $ids): array
    {
        if ($ids === []) {
            return [];
        }

        $totals = $this->totals($ids);
        $latest = $this->latest($ids);
        $agents = $this->distinct($ids, ['name'], self::AGENT_CAP);
        $users = $this->distinct($ids, ['user_type', 'user_id'], self::USER_CAP, notNull: true);

        $summaries = [];

        foreach (array_keys($ids) as $slot) {
            $row = $totals[$slot] ?? null;
            $last = $latest[$slot] ?? null;

            // A conversation pruned between the list and this read has nothing left to describe. The page
            // then holds one row fewer than the total counted, which is not worth a second read to hide.
            if ($row === null || $last === null) {
                continue;
            }

            $count = fn (string $column): int => self::integer($row->{$column} ?? null) ?? 0;
            $sum = fn (string $column): ?int => self::integer($row->{$column} ?? null);

            $summaries[] = new ConversationSummary(
                id: $last['conversation_id'],
                turns: [
                    'all' => $count('turns'),
                    'completed' => $count('completed'),
                    'failed' => $count('failed'),
                    'incomplete' => $count('incomplete'),
                    'running' => $count('running'),
                    'awaiting_approval' => $count('awaiting_approval'),
                ],
                agents: array_map(fn (array $agent) => $agent['name'], $agents[$slot]['rows'] ?? []),
                agentCount: $agents[$slot]['count'] ?? 0,
                users: array_map(fn (array $user) => ['type' => $user['user_type'], 'id' => $user['user_id']], $users[$slot]['rows'] ?? []),
                userCount: $users[$slot]['count'] ?? 0,
                inputTokens: $sum('input_tokens'),
                outputTokens: $sum('output_tokens'),
                cacheReadTokens: $sum('cache_read_tokens'),
                cacheWriteTokens: $sum('cache_write_tokens'),
                reasoningTokens: $sum('reasoning_tokens'),
                cost: is_numeric($row->cost ?? null) ? $row->cost : null,
                unpricedSpanCount: $count('unpriced_span_count'),
                promptExcerpt: $last['prompt_excerpt'],
                firstActivityAt: self::moment($row->first_activity_at ?? null),
                lastActivityAt: self::moment($row->last_activity_at ?? null),
            );
        }

        return $summaries;
    }

    /**
     * Every turn of the given conversations, each with the slot of its conversation in $ids.
     * The slot is worked out in the database, by the same comparison that matched the turn, so
     * a database that compares text without regard to case puts the spellings of one conversation
     * together rather than leaving PHP to match them.
     *
     * @param  list<string>  $ids
     */
    private function turns(array $ids): Builder
    {
        $branches = [];

        $bindings = [];

        foreach ($ids as $slot => $id) {
            $branches[] = 'when conversation_id = ? then ?';
            array_push($bindings, $id, $slot);
        }

        $turns = Trace::query()->toBase()
            ->select([
                'id', 'conversation_id', 'name', 'status', 'created_at', 'started_at', 'user_type', 'user_id',
                'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'reasoning_tokens',
                'cost', 'unpriced_span_count', 'prompt_excerpt',
            ])
            ->whereIn('conversation_id', $ids);

        return $turns->selectRaw('case '.implode(' ', $branches).' end as slot', $bindings);
    }

    /**
     * @param  Builder  $source  a query to read from, as a derived table
     */
    private function over(Builder $source): Builder
    {
        return $source->newQuery()->fromSub($source, 't');
    }

    /**
     * @param  list<string>  $ids
     * @return array<int, object> by slot
     */
    private function totals(array $ids): array
    {
        $running = Status::Running->value;
        $cutoff = StaleRuns::cutoffColumn();

        $query = $this->over($this->turns($ids))->select('slot')
            ->selectRaw('count(*) as turns')
            ->selectRaw(self::count('status = ?').' as completed', [Status::Completed->value])
            ->selectRaw(self::count('status = ?').' as failed', [Status::Failed->value])
            // The stale rule is applied to every turn before it is counted.
            ->selectRaw(self::count('status = ? or (status = ? and created_at < ?)').' as incomplete', [Status::Incomplete->value, $running, $cutoff])
            ->selectRaw(self::count('status = ? and created_at >= ?').' as running', [$running, $cutoff])
            ->selectRaw(self::count('status = ?').' as awaiting_approval', [Status::AwaitingApproval->value]);

        foreach (['input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'reasoning_tokens', 'cost', 'unpriced_span_count'] as $column) {
            $query->selectRaw('sum('.$column.') as '.$column);
        }

        $rows = $query
            ->selectRaw('min(started_at) as first_activity_at')
            ->selectRaw('max(started_at) as last_activity_at')
            ->groupBy('slot')
            ->get();

        return $this->bySlot($rows->all());
    }

    /**
     * The turn that started last, ties by id: the spelling of the conversation's id that is shown,
     * and its prompt.
     *
     * @param  list<string>  $ids
     * @return array<int, array{conversation_id: string, prompt_excerpt: ?string}>
     */
    private function latest(array $ids): array
    {
        $ranked = $this->over($this->turns($ids))->select('slot', 'conversation_id', 'prompt_excerpt')
            ->selectRaw('row_number() over (partition by slot order by started_at desc, id desc) as place');

        $rows = $this->over($ranked)->select('slot', 'conversation_id', 'prompt_excerpt')->where('place', 1)->get();

        $latest = [];

        foreach ($rows as $row) {
            $slot = self::integer($row->slot ?? null);

            if ($slot !== null && is_string($row->conversation_id ?? null)) {
                $latest[$slot] = [
                    'conversation_id' => $row->conversation_id,
                    'prompt_excerpt' => is_string($row->prompt_excerpt ?? null) ? $row->prompt_excerpt : null,
                ];
            }
        }

        return $latest;
    }

    /**
     * The first distinct values of the given columns of each conversation, in the order of the
     * columns, and how many distinct values it has in all, counted by the database.
     *
     * @param  list<string>  $ids
     * @param  list<literal-string>  $columns
     * @param  bool  $notNull  leave out turns where any of the columns is null
     * @return array<int, array{rows: list<array<string, string>>, count: int}> by slot
     */
    private function distinct(array $ids, array $columns, int $cap, bool $notNull = false): array
    {
        $turns = $this->turns($ids);

        foreach ($notNull ? $columns : [] as $column) {
            $turns->whereNotNull($column);
        }

        $distinct = $this->over($turns)->distinct()->select('slot', ...$columns);

        $order = implode(', ', $columns);
        $numbered = $this->over($distinct)->select('slot', ...$columns)
            ->selectRaw('row_number() over (partition by slot order by '.$order.') as place')
            ->selectRaw('count(*) over (partition by slot) as total');

        $rows = $this->over($numbered)->select('slot', 'total', 'place', ...$columns)
            ->where('place', '<=', $cap)->orderBy('slot')->orderBy('place')->get();

        $found = [];

        foreach ($rows as $row) {
            $slot = self::integer($row->slot ?? null);

            if ($slot === null) {
                continue;
            }

            $found[$slot] ??= ['rows' => [], 'count' => self::integer($row->total ?? null) ?? 0];
            $found[$slot]['rows'][] = array_combine($columns, array_map(fn (string $column) => self::text($row->{$column} ?? null), $columns));
        }

        return $found;
    }

    /**
     * @param  array<array-key, object>  $rows
     * @return array<int, object>
     */
    private function bySlot(array $rows): array
    {
        $bySlot = [];

        foreach ($rows as $row) {
            $slot = self::integer($row->slot ?? null);

            if ($slot !== null) {
                $bySlot[$slot] = $row;
            }
        }

        return $bySlot;
    }

    /**
     * A count or sum as the driver returns it (an int, a float or a decimal string), null for none.
     */
    private static function integer(mixed $value): ?int
    {
        return is_numeric($value) ? (int) $value : null;
    }

    /**
     * The sum of a condition: how many rows meet it.
     *
     * @param  literal-string  $condition
     * @return literal-string
     */
    private static function count(string $condition): string
    {
        return 'sum(case when '.$condition.' then 1 else 0 end)';
    }

    private static function text(mixed $value): string
    {
        return is_scalar($value) ? (string) $value : '';
    }

    private static function moment(mixed $value): DateTimeImmutable
    {
        $timezone = config('app.timezone');

        return new DateTimeImmutable(is_string($value) ? $value : 'now', new DateTimeZone(is_string($timezone) ? $timezone : 'UTC'));
    }
}
