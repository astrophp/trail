<?php

namespace Astro\Trail\Tests\Fixtures\Capture\Queue;

use Illuminate\Container\Container;
use Illuminate\Contracts\Queue\Job as JobContract;
use Illuminate\Queue\Jobs\Job;

/**
 * A job popped from the MemoryQueue. It is not a SyncJob, so it behaves like a job on a real queue.
 */
class MemoryJob extends Job implements JobContract
{
    public function __construct(
        Container $container,
        private readonly MemoryQueue $memory,
        private readonly string $raw,
        private readonly int $attempt,
        string $connectionName,
        string $queue,
    ) {
        $this->container = $container;
        $this->connectionName = $connectionName;
        $this->queue = $queue;
    }

    public function getJobId(): string
    {
        return 'memory-job';
    }

    public function getRawBody(): string
    {
        return $this->raw;
    }

    public function attempts(): int
    {
        return $this->attempt;
    }

    public function release($delay = 0): void
    {
        parent::release($delay);

        $this->memory->retry($this->raw, $this->attempt);
    }
}
