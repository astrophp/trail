<?php

namespace Astro\Trail\Queries;

use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\HeaderUtils;

/**
 * A text parameter read from the raw query string. The request's own query has been through the
 * framework's middleware, which trims a value and turns an empty one into null, and an id or a name
 * may start or end with a space.
 */
final class RawQuery
{
    /**
     * @return ?string null when the parameter is absent or is not a single string (a list, say)
     */
    public static function string(Request $request, string $name): ?string
    {
        $query = $request->server->get('QUERY_STRING');
        $value = HeaderUtils::parseQuery(is_string($query) ? $query : '')[$name] ?? null;

        return is_string($value) ? $value : null;
    }
}
