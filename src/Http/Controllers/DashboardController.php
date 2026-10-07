<?php

namespace Astro\Trail\Http\Controllers;

use Illuminate\Http\Response;

class DashboardController
{
    public function __invoke(): Response
    {
        return new Response('Trail');
    }
}
