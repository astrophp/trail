<?php

use Astro\Trail\Tests\Fixtures\Http\ServesFromCustomDomain;

afterEach(function () {
    // Some tests change the environment; a failed assertion must not leave it changed.
    $this->app['env'] = 'testing';
});

uses(ServesFromCustomDomain::class);

it('answers on the configured domain', function () {
    $this->app['env'] = 'local';

    $this->get('http://trail.example.test/trail')->assertOk();
    $this->get('http://trail.example.test/trail/api/x')->assertNotFound();
});

it('answers 404 on any other domain', function () {
    $this->app['env'] = 'local';

    $this->get('http://app.example.test/trail')->assertNotFound();
});
