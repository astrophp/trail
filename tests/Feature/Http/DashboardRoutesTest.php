<?php

use Illuminate\Support\Facades\Route;

it('reserves the api space ahead of the catch-all', function () {
    $this->app['env'] = 'local';

    $this->get('/trail/api/anything/deep')->assertNotFound()->assertExactJson(['message' => 'Not Found.']);
    $this->get('/trail/api')->assertNotFound()->assertExactJson(['message' => 'Not Found.']);
    // The environment is no longer "testing", so the web middleware's CSRF check applies and needs its token.
    $this->withSession(['_token' => 'token'])->post('/trail/api/anything', ['_token' => 'token'])->assertNotFound()->assertExactJson(['message' => 'Not Found.']);
});

it('serves the page for everything else, including look-alikes of the api space', function () {
    $this->app['env'] = 'local';

    $this->get('/trail')->assertOk()->assertSee('Trail');
    $this->get('/trail/apix')->assertOk()->assertSee('Trail');
    $this->get('/trail/traces/abc')->assertOk()->assertSee('Trail');
});

it('registers the fallback before the page', function () {
    $names = collect(Route::getRoutes()->getRoutes())->map->getName()->filter(fn ($name) => str_starts_with((string) $name, 'trail.'))->values()->all();

    expect($names)->toBe(['trail.api.fallback', 'trail.dashboard']);
});
