<?php

use Astro\Trail\Tests\Fixtures\Http\ServesFromCustomPath;

uses(ServesFromCustomPath::class);

it('serves the dashboard at the configured path with the slashes around it ignored', function () {
    $this->app['env'] = 'local';

    $this->get('/ai/trail')->assertOk();
    $this->get('/ai/trail/traces/abc')->assertOk();
    $this->get('/trail')->assertNotFound();
    expect(route('trail.dashboard', [], false))->toBe('/ai/trail');
});

it('keeps the api space under the configured path', function () {
    $this->app['env'] = 'local';

    $this->get('/ai/trail/api/anything')->assertNotFound();
});
