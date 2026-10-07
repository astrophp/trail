<?php

namespace Astro\Trail\Tests\Fixtures\Storage;

/**
 * Reads back what a TraceStore wrote, as plain PHP values that compare the same
 * on every implementation.
 */
interface StoreProbe
{
    /**
     * @return array<string, mixed>|null keyed by column name
     */
    public function trace(string $id): ?array;

    /**
     * @return list<array<string, mixed>> ordered by sequence, then id
     */
    public function spans(string $traceId): array;

    public function traceCount(): int;

    public function spanCount(): int;
}
