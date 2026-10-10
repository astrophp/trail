<?php

namespace Astro\Trail\Tests\Fixtures\Capture\Queue;

use Illuminate\Contracts\Queue\Queue as QueueContract;
use Illuminate\Queue\Queue;

/**
 * A queue held in an array, so a real worker can run it without a jobs table.
 */
class MemoryQueue extends Queue implements QueueContract
{
    /** @var list<array{payload: string, attempts: int}> */
    public array $entries = [];

    public function size($queue = null): int
    {
        return count($this->entries);
    }

    public function pendingSize($queue = null): int
    {
        return count($this->entries);
    }

    public function delayedSize($queue = null): int
    {
        return 0;
    }

    public function reservedSize($queue = null): int
    {
        return 0;
    }

    public function creationTimeOfOldestPendingJob($queue = null): ?int
    {
        return null;
    }

    public function push($job, $data = '', $queue = null): mixed
    {
        return $this->pushRaw($this->createPayload($job, $queue ?? 'default', $data), $queue);
    }

    public function pushRaw($payload, $queue = null, array $options = []): mixed
    {
        $this->entries[] = ['payload' => $payload, 'attempts' => 0];

        return null;
    }

    public function later($delay, $job, $data = '', $queue = null): mixed
    {
        return $this->push($job, $data, $queue);
    }

    public function pop($queue = null): ?MemoryJob
    {
        $entry = array_shift($this->entries);

        if ($entry === null) {
            return null;
        }

        return new MemoryJob($this->container, $this, $entry['payload'], $entry['attempts'] + 1, $this->connectionName, $queue ?? 'default');
    }

    public function retry(string $payload, int $attempts): void
    {
        $this->entries[] = ['payload' => $payload, 'attempts' => $attempts];
    }
}
