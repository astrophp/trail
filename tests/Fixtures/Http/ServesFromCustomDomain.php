<?php

namespace Astro\Trail\Tests\Fixtures\Http;

/**
 * Boots the application with the dashboard restricted to one domain.
 */
trait ServesFromCustomDomain
{
    protected function defineEnvironment($app): void
    {
        $app['config']->set('trail.domain', 'trail.example.test');
    }
}
