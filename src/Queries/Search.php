<?php

namespace Astro\Trail\Queries;

use Astro\Trail\Storage\Models\Trace;

/**
 * The few runs, conversations and agents that best match a text, for a command palette. Each group
 * is read by the index behind the matching list, so it matches what that list's search matches,
 * with the ones found by id ahead of the ones found by text; only the id reads ignore the time range.
 *
 * Each group is cut at LIMIT and says whether more matched. A group reads LIMIT + 1 of each kind of
 * match: if the two kinds together hold more than LIMIT different items, at least LIMIT + 1 of them
 * are read, so the cut is never reported falsely and never missed.
 */
final class Search
{
    /** The most items a group returns. */
    public const LIMIT = 5;

    public function __construct(
        private readonly TraceIndex $traces,
        private readonly ConversationIndex $conversationIndex,
        private readonly Conversations $conversations,
        private readonly AgentIndex $agents,
    ) {}

    public function read(TimeRange $range, SearchTerm $term): SearchResults
    {
        if (! $term->searchable()) {
            return SearchResults::none();
        }

        $read = self::LIMIT + 1;

        $runs = $this->traces->withId($term->text, $read)
            ->concat($this->traces->rows($range, new TraceFilters(search: $term->text), null, new Page(1, $read)))
            ->unique(fn (Trace $trace) => $trace->id)
            ->values();

        $ids = array_values(array_unique(array_merge(
            array_filter([$this->conversationIndex->exact($term->text)]),
            $this->conversationIndex->ids($range, new ConversationFilters(search: $term->text), new Page(1, $read)),
        )));

        $agents = $this->agents->list($range, new AgentFilters(search: $term->text), new Page(1, self::LIMIT));

        return new SearchResults(
            array_values($runs->take(self::LIMIT)->all()),
            $runs->count() > self::LIMIT,
            $this->conversations->summaries(array_slice($ids, 0, self::LIMIT)),
            count($ids) > self::LIMIT,
            $agents->agents,
            $agents->total > self::LIMIT,
        );
    }
}
