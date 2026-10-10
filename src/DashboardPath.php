<?php

namespace Astro\Trail;

/**
 * Where the dashboard lives, from the trail.path setting.
 */
final class DashboardPath
{
    /**
     * The path without slashes around it. Never empty: the dashboard answers every path under it,
     * so the root would take over the application's own.
     */
    public static function prefix(): string
    {
        $path = config('trail.path');
        $path = is_string($path) ? trim($path, '/') : '';

        return $path === '' ? 'trail' : $path;
    }
}
