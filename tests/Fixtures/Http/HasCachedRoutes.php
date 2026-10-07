<?php

namespace Astro\Trail\Tests\Fixtures\Http;

use Illuminate\Support\Env;

/**
 * Boots the application as one whose routes are cached, by pointing the route cache at a file that
 * exists. Nothing is ever loaded from that file: only its presence matters to the application.
 */
trait HasCachedRoutes
{
    private ?string $routeCache = null;

    protected function defineEnvironment($app): void
    {
        $this->routeCache = tempnam(sys_get_temp_dir(), 'trail-routes-');
        file_put_contents($this->routeCache, '<?php return [];');

        Env::getRepository()->set('APP_ROUTES_CACHE', $this->routeCache);
    }

    protected function tearDownHasCachedRoutes(): void
    {
        Env::getRepository()->clear('APP_ROUTES_CACHE');

        if ($this->routeCache !== null) {
            @unlink($this->routeCache);
        }
    }
}
