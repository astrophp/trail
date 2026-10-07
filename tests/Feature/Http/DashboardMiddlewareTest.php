<?php

use Astro\Trail\Tests\Fixtures\Http\AddsMiddleware;

uses(AddsMiddleware::class);

it('runs the middleware from the configuration', function () {
    $this->app['env'] = 'local';

    $this->get('/trail')->assertOk()->assertHeader('X-Marked', 'yes');
});

it('still runs the access check next to it', function () {
    $this->app['env'] = 'production';

    $this->get('/trail')->assertForbidden();
});
