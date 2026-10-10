<?php

namespace Astro\Trail\Tests\Fixtures\Storage;

use Astro\Trail\Storage\Contracts\TraceStore;

/**
 * Runs written through the store, so that the spans, the totals of the run and the per-run summaries
 * agree as they do for a captured run.
 */
final class Stored
{
    /**
     * Write a run and its spans in one write.
     *
     * @param  array<string, mixed>  $trace  the attributes of Records::trace()
     * @param  list<array<string, mixed>>  $spans  the attributes of Records::span(), without the run's id
     */
    public static function run(array $trace = [], array $spans = []): string
    {
        $record = Records::trace($trace);

        app(TraceStore::class)->store($record, array_map(fn (array $span) => Records::span($record->id, $span), $spans));

        return $record->id;
    }
}
