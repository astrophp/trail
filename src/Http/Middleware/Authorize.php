<?php

namespace Astro\Trail\Http\Middleware;

use Astro\Trail\Trail;
use Closure;
use Illuminate\Contracts\Config\Repository;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class Authorize
{
    public function __construct(private readonly Trail $trail, private readonly Repository $config) {}

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        // A cached route file keeps the routes it was built with, so the switches are read here as well.
        if (! $this->config->get('trail.enabled') || ! $this->config->get('trail.dashboard.enabled')) {
            abort(404);
        }

        if (! $this->trail->check($request)) {
            abort(403);
        }

        return $next($request);
    }
}
