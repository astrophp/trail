<?php

namespace Astro\Trail\Tests\Fixtures\Http;

/**
 * Boots the application with the dashboard path set to a value with slashes around it, as a published config could have it.
 */
trait ServesFromCustomPath
{
    protected function defineEnvironment($app): void
    {
        $app['config']->set('trail.path', '/ai/trail/');
    }
}
