<?php

use Astro\Trail\Tests\Fixtures\Sdk\DisablesTrail;
use Illuminate\Support\Facades\Route;

afterEach(function () {
    // Some tests change the environment; a failed assertion must not leave it changed.
    $this->app['env'] = 'testing';
});

uses(DisablesTrail::class);

it('registers no Trail route and answers 404 when Trail is switched off', function () {
    $this->app['env'] = 'local';

    $names = collect(Route::getRoutes()->getRoutes())->map->getName()->filter(fn ($name) => str_starts_with((string) $name, 'trail.'));

    expect($names->all())->toBe([]);

    $this->get('/trail')->assertNotFound();
});
