<?php

namespace Workbench\App\Http;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Running a scenario can spend a real provider key, so the workbench only answers the machine it runs on.
 */
class LoopbackOnly
{
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless(in_array($request->ip(), ['127.0.0.1', '::1'], true), 403, 'The workbench only answers requests from this machine.');

        return $next($request);
    }
}
