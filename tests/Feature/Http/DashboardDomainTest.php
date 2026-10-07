<?php

use Astro\Trail\Tests\Fixtures\Http\ServesFromCustomDomain;

uses(ServesFromCustomDomain::class);

it('answers on the configured domain', function () {
    $this->app['env'] = 'local';

    $this->get('http://trail.example.test/trail')->assertOk();
    $this->get('http://trail.example.test/trail/api/x')->assertNotFound()->assertExactJson(['message' => 'Not Found.']);
});

it('answers 404 on any other domain', function () {
    $this->app['env'] = 'local';

    $this->get('http://app.example.test/trail')->assertNotFound();
});
