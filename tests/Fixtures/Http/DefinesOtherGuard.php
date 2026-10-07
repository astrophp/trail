<?php

namespace Astro\Trail\Tests\Fixtures\Http;

/**
 * Adds a second session guard next to the default one.
 */
trait DefinesOtherGuard
{
    protected function defineEnvironment($app): void
    {
        $app['config']->set('auth.guards.other', ['driver' => 'session', 'provider' => 'users']);
    }
}
