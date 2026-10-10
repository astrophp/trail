<?php

namespace Astro\Trail\Storage\Contracts;

use Astro\Trail\Storage\SpanRecord;
use Astro\Trail\Storage\TraceRecord;
use DateTimeInterface;

interface TraceStore
{
    /** The shortest age, in seconds, at which a running trace can be swept as abandoned. */
    public const MINIMUM_STALE_SECONDS = 60;

    /**
     * Record that a trace has started, as a single insert. Does nothing when the
     * trace is already stored, so it never downgrades or overwrites a later write.
     */
    public function start(TraceRecord $trace): void;

    /**
     * Store the current state of a trace together with the given spans, as one
     * batch. The record is the complete state of the trace; spans are matched by
     * id and added or updated. A running write never overwrites a trace or span
     * that already has a final status. Token totals, cost and span counts are
     * recomputed from every span stored for the trace.
     *
     * @param  list<SpanRecord>  $spans
     *
     * @throws \InvalidArgumentException when a span belongs to a different trace
     */
    public function store(TraceRecord $trace, array $spans): void;

    /**
     * Mark running traces and spans that were first stored more than the given
     * number of seconds ago as incomplete and abandoned. Values below
     * MINIMUM_STALE_SECONDS are raised to it. Returns the number of traces marked.
     */
    public function sweep(int $olderThanSeconds): int;

    /**
     * Delete traces first stored before the given moment, with their spans and
     * bookmarks. Returns the number of traces deleted.
     */
    public function prune(DateTimeInterface $before): int;

    /**
     * Delete every trace, span and bookmark. Prices are kept.
     */
    public function clear(): void;
}
