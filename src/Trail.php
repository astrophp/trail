<?php

namespace Astro\Trail;

use Astro\Trail\Capture\Guard;
use Astro\Trail\Capture\Recorder;
use Astro\Trail\Storage\ArrayTraceStore;
use Astro\Trail\Storage\Contracts\TraceStore;
use Illuminate\Contracts\Container\Container;

class Trail
{
    public function __construct(private readonly Container $container) {}

    /**
     * The store Trail currently writes to. Resolved on every call so a later fake takes effect.
     */
    public function store(): TraceStore
    {
        return $this->container->make(TraceStore::class);
    }

    /**
     * Replace Trail's storage with an empty in-memory store, so tests never touch its tables.
     */
    public function fake(): ArrayTraceStore
    {
        $store = new ArrayTraceStore;

        $this->container->instance(TraceStore::class, $store);

        return $store;
    }

    /**
     * Write every trace Trail is still holding, finished or not, and forget it. Never throws.
     */
    public function flush(): void
    {
        Guard::run(function (): void {
            $recorder = $this->container->make(Recorder::class);
            $recorder->flush();
        });
    }
}
