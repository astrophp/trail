<?php

use Astro\Trail\Tests\Fixtures\Http\UsesMiddlewareString;

afterEach(function () {
    // Some tests change the environment; a failed assertion must not leave it changed.
    $this->app['env'] = 'testing';
});

uses(UsesMiddlewareString::class);

it('accepts the middleware as a string and still runs the access check', function () {
    $this->app['env'] = 'production';

    $this->get('/trail')->assertForbidden();

    $this->app['env'] = 'local';

    $this->get('/trail')->assertOk();
});
