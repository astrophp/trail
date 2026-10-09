<?php

namespace Astro\Trail\Storage;

/**
 * The conditions on a span that the grouped reads and the per-run summaries share, so that what
 * counts as a billing span, or as one that reported usage, is written down once.
 */
final class SpanSql
{
    /**
     * The spans that bill: steps and embeddings.
     *
     * @param  literal-string  $alias  what the spans are called in the query
     * @return literal-string
     */
    public static function bills(string $alias): string
    {
        return "{$alias}.type in ('step', 'embedding')";
    }

    /**
     * The spans that reported any usage, as SpanUsage::reportedUsage has it.
     *
     * @param  literal-string  $alias
     * @return literal-string
     */
    public static function reported(string $alias): string
    {
        return "({$alias}.input_tokens is not null or {$alias}.output_tokens is not null or {$alias}.cache_read_tokens is not null or {$alias}.cache_write_tokens is not null or {$alias}.reasoning_tokens is not null)";
    }
}
