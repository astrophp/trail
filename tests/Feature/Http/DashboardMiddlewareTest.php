<?php

use Astro\Trail\Tests\Fixtures\Http\AddsMiddleware;

afterEach(function () {
    // Some tests change the environment; a failed assertion must not leave it changed.
    $this->app['env'] = 'testing';
});

uses(AddsMiddleware::class);

it('runs the middleware from the configuration', function () {
    $this->app['env'] = 'local';

    $this->get('/trail')->assertOk()->assertHeader('X-Marked', 'yes');
});

it('still runs the access check next to it', function () {
    $this->app['env'] = 'production';

    $this->get('/trail')->assertForbidden();
});
