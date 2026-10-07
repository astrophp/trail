<?php

namespace Astro\Trail\Tests\Fixtures\Http;

/**
 * Boots the application with only the dashboard switched off; recording stays on.
 */
trait DisablesDashboard
{
    protected function defineEnvironment($app): void
    {
        $app['config']->set('trail.dashboard.enabled', false);
    }
}
