<?php

namespace Astro\Trail\Tests\Fixtures\Http;

/**
 * Boots the application with the middleware setting given as a string rather than a list.
 */
trait UsesMiddlewareString
{
    protected function defineEnvironment($app): void
    {
        $app['config']->set('trail.middleware', 'web');
    }
}
