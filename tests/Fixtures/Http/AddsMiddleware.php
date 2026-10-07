<?php

namespace Astro\Trail\Tests\Fixtures\Http;

/**
 * Boots the application with an extra middleware after `web`.
 */
trait AddsMiddleware
{
    protected function defineEnvironment($app): void
    {
        $app['config']->set('trail.middleware', ['web', MarksResponse::class]);
    }
}
