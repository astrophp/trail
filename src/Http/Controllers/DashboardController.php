<?php

namespace Astro\Trail\Http\Controllers;

use Astro\Trail\Trail;
use Illuminate\Contracts\View\View;

class DashboardController
{
    /**
     * The one page every dashboard URL gets; the dashboard routes itself in the browser.
     */
    public function __invoke(Trail $trail): View
    {
        $name = config('app.name');

        return view('trail::layout', [
            'title' => is_string($name) && $name !== '' ? "Trail - {$name}" : 'Trail',
            'nonce' => $trail->nonceAttribute(),
            'css' => $trail->css(),
            'js' => $trail->js(),
        ]);
    }
}
