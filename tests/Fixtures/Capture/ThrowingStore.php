<?php

namespace Astro\Trail\Tests\Fixtures\Capture;

use Astro\Trail\Storage\Contracts\TraceStore;
use Astro\Trail\Storage\TraceRecord;
use DateTimeInterface;
use RuntimeException;

/**
 * A store whose database is down.
 */
class ThrowingStore implements TraceStore
{
    public function start(TraceRecord $trace): void
    {
        throw new RuntimeException('The store is down.');
    }

    public function store(TraceRecord $trace, array $spans): void
    {
        throw new RuntimeException('The store is down.');
    }

    public function sweep(int $olderThanSeconds): int
    {
        throw new RuntimeException('The store is down.');
    }

    public function prune(DateTimeInterface $before): int
    {
        throw new RuntimeException('The store is down.');
    }

    public function clear(): void
    {
        throw new RuntimeException('The store is down.');
    }
}
