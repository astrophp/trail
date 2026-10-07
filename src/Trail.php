<?php

namespace Astro\Trail;

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
}
