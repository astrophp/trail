<?php

namespace Astro\Trail\Tests\Fixtures\Sdk;

/**
 * Boots the application with Trail switched off, the way an application with TRAIL_ENABLED=false
 * boots: the setting is in place before any service provider registers or boots.
 */
trait DisablesTrail
{
    protected function defineEnvironment($app): void
    {
        $app['config']->set('trail.enabled', false);
    }
}
