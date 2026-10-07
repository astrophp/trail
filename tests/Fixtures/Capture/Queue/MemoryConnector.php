<?php

namespace Astro\Trail\Tests\Fixtures\Capture\Queue;

use Illuminate\Contracts\Queue\Queue;
use Illuminate\Queue\Connectors\ConnectorInterface;

class MemoryConnector implements ConnectorInterface
{
    public function __construct(private readonly MemoryQueue $queue) {}

    public function connect(array $config): Queue
    {
        return $this->queue;
    }
}
