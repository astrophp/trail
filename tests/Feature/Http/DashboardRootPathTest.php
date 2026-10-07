<?php

use Astro\Trail\Tests\Fixtures\Http\ServesFromRoot;
use Illuminate\Support\Facades\Route;

uses(ServesFromRoot::class);

it('never serves the dashboard from the root of the domain, where it would take every path of the application', function () {
    $this->app['env'] = 'local';
    Route::get('/home', fn () => 'home');

    $this->get('/home')->assertOk()->assertSee('home');
    $this->get('/')->assertNotFound();
    $this->get('/trail')->assertOk();
    expect(route('trail.dashboard', [], false))->toBe('/trail');
});
