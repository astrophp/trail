<?php

namespace Astro\Trail\Tests\Fixtures\Http;

/**
 * Boots the application with an empty middleware list.
 */
trait UsesNoMiddleware
{
    protected function defineEnvironment($app): void
    {
        $app['config']->set('trail.middleware', []);
    }
}
