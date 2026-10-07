<?php

use Astro\Trail\Tests\Fixtures\Http\UsesMiddlewareString;

uses(UsesMiddlewareString::class);

it('accepts the middleware as a string and still runs the access check', function () {
    $this->app['env'] = 'production';

    $this->get('/trail')->assertForbidden();

    $this->app['env'] = 'local';

    $this->get('/trail')->assertOk();
});
