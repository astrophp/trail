<?php

namespace Astro\Trail\Queries;

use Astro\Trail\Storage\Models\Trace;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Query\Builder as BaseBuilder;

/**
 * The reads behind a conversation's transcript: a window of its turns in the order they started,
 * and how many lie beyond it on either side.
 *
 * Turns are ordered by when they started and then by id, and a position is always compared inside
 * the database against the stored value of the turn it is relative to, never against a timestamp
 * bound from PHP. A turn that shares its start with another, or differs from it by a millisecond,
 * is therefore neither skipped nor repeated from one window to the next.
 */
final class ConversationTurns
{
    /**
     * The anchor as stored, or null when it is not a turn of this conversation (it never was, was
     * pruned, or belongs to another). The id is the one the database holds, which a database that
     * compares text without regard to case may spell differently from the request.
     */
    public function anchor(string $conversationId, string $turnId): ?string
    {
        $id = Trace::query()->toBase()->where('id', $turnId)->where('conversation_id', $conversationId)->value('id');

        return is_string($id) ? $id : null;
    }

    /**
     * The turns of the window, oldest first.
     *
     * @param  string|null  $anchor  `turn`, `before` or `after`
     * @param  string|null  $anchorId  the anchor as stored
     * @return Collection<int, Trace>
     */
    public function window(string $conversationId, int $limit, ?string $anchor, ?string $anchorId): Collection
    {
        $query = Trace::query()->where('conversation_id', $conversationId);
        $newestFirst = $anchor !== 'after';

        if ($anchor !== null && $anchorId !== null) {
            $query = $this->past($query, $anchorId, $anchor === 'after' ? '>' : '<', inclusive: $anchor === 'turn');
        }

        $direction = $newestFirst ? 'desc' : 'asc';
        $turns = $query->orderBy('started_at', $direction)->orderBy('id', $direction)->limit($limit)->get();

        return $newestFirst ? $turns->reverse()->values() : $turns;
    }

    /**
     * How many turns of the conversation start before the first of the window and after the last
     * one. Read in one query over one row.
     *
     * @return array{older: int, newer: int}
     */
    public function beyond(string $conversationId, string $firstId, string $lastId): array
    {
        $turns = fn (string $pivotId, string $operator) => $this->past(
            Trace::query()->toBase()->where('conversation_id', $conversationId)->selectRaw('count(*)'),
            $pivotId,
            $operator,
            inclusive: false,
        );

        $row = Trace::query()->toBase()->newQuery()
            ->selectSub($turns($firstId, '<'), 'older')
            ->selectSub($turns($lastId, '>'), 'newer')
            ->first();

        $counts = (array) $row;

        return [
            'older' => is_numeric($counts['older'] ?? null) ? (int) $counts['older'] : 0,
            'newer' => is_numeric($counts['newer'] ?? null) ? (int) $counts['newer'] : 0,
        ];
    }

    /**
     * Keeps the turns past a pivot turn: started later, or started together and has a greater id
     * ('>'), or the same before it ('<').
     *
     * @template TQuery of Builder<Trace>|BaseBuilder
     *
     * @param  TQuery  $query
     * @return TQuery
     */
    private function past(Builder|BaseBuilder $query, string $pivotId, string $operator, bool $inclusive): Builder|BaseBuilder
    {
        $started = fn () => Trace::query()->toBase()->from((new Trace)->getTable().' as pivot')->select('pivot.started_at')->where('pivot.id', $pivotId);

        return $query->where(function (Builder|BaseBuilder $query) use ($started, $pivotId, $operator, $inclusive) {
            $query->where('started_at', $operator, $started())
                ->orWhere(fn (Builder|BaseBuilder $tied) => $tied->where('started_at', '=', $started())->where('id', $inclusive ? $operator.'=' : $operator, $pivotId));
        });
    }
}
