<?php

namespace Astro\Trail\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Makes the request expect JSON, so the exception handler renders every error on the API (403, 404,
 * 422) as a JSON body whatever the browser sent in Accept.
 */
class RespondWithJson
{
    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $request->headers->set('Accept', 'application/json');

        return $next($request);
    }
}
