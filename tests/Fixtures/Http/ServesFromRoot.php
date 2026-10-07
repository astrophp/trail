<?php

namespace Astro\Trail\Tests\Fixtures\Http;

/**
 * Boots the application with a dashboard path that names the root of the domain.
 */
trait ServesFromRoot
{
    protected function defineEnvironment($app): void
    {
        $app['config']->set('trail.path', '/');
    }
}
