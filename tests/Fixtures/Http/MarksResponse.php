<?php

namespace Astro\Trail\Tests\Fixtures\Http;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Marks every response it sees, so a test can tell that it ran.
 */
class MarksResponse
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        $response->headers->set('X-Marked', 'yes');

        return $response;
    }
}
