<?php

use Astro\Trail\Tests\Fixtures\Http\ServesFromCustomDomain;

uses(ServesFromCustomDomain::class);

it('serves the page on the configured domain with the path unchanged', function () {
    $this->app['env'] = 'local';

    $boot = bootObject($this->get('http://trail.example.test/trail/traces/abc')->assertOk()->getContent());

    expect($boot)->toMatchArray(['path' => '/trail', 'apiPath' => '/trail/api']);
});
