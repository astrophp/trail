<?php

namespace Astro\Trail\Facades;

use Illuminate\Support\Facades\Facade;

/**
 * @method static \Astro\Trail\Storage\Contracts\TraceStore store()
 * @method static \Astro\Trail\Storage\ArrayTraceStore fake()
 * @method static void flush()
 *
 * @see \Astro\Trail\Trail
 */
class Trail extends Facade
{
    protected static function getFacadeAccessor(): string
    {
        return \Astro\Trail\Trail::class;
    }
}
