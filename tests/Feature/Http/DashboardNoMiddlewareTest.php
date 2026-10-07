<?php

use Astro\Trail\Tests\Fixtures\Http\UsesNoMiddleware;

uses(UsesNoMiddleware::class);

it('runs the access check even when the middleware list is emptied', function () {
    $this->app['env'] = 'production';

    $this->get('/trail')->assertForbidden();
    $this->get('/trail/api/x')->assertForbidden();
});

it('lets a request through when the check passes', function () {
    $this->app['env'] = 'local';

    $this->get('/trail')->assertOk();
});
