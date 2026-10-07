<?php

namespace Astro\Trail\Tests\Fixtures\Capture;

use Astro\Trail\Storage\Contracts\TraceStore;
use Astro\Trail\Storage\TraceRecord;
use DateTimeInterface;
use RuntimeException;

/**
 * A store that fails its first write and passes everything else to a real store.
 */
class FailsFirstStore implements TraceStore
{
    private int $writes = 0;

    public function __construct(private readonly TraceStore $store) {}

    public function start(TraceRecord $trace): void
    {
        $this->store->start($trace);
    }

    public function store(TraceRecord $trace, array $spans): void
    {
        if (++$this->writes === 1) {
            throw new RuntimeException('The first write fails.');
        }

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
