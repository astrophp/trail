<?php

namespace Astro\Trail\Tests\Fixtures\Capture;

use Astro\Trail\Storage\Contracts\TraceStore;
use Astro\Trail\Storage\TraceRecord;
use DateTimeInterface;
use RuntimeException;

/**
 * A store whose first insert fails, as when the database blips as a run starts, and which
 * passes everything else to a real store.
 */
class FailsOnStartStore implements TraceStore
{
    public function __construct(private readonly TraceStore $store) {}

    public function start(TraceRecord $trace): void
    {
        throw new RuntimeException('The start insert fails.');
    }

    public function store(TraceRecord $trace, array $spans): void
    {
        $this->store->store($trace, $spans);
    }

    public function sweep(int $olderThanSeconds): int
    {
        return $this->store->sweep($olderThanSeconds);
    }

    public function prune(DateTimeInterface $before): int
    {
        return $this->store->prune($before);
    }

    public function clear(): void
    {
        $this->store->clear();
    }
}
