<?php

use Astro\Trail\Tests\Fixtures\Http\ServesFromCustomPath;

uses(ServesFromCustomPath::class);

it('writes the configured path into the boot object of the page', function () {
    $this->app['env'] = 'local';

    expect(bootObject($this->get('/ai/trail/traces/abc')->assertOk()->getContent()))
        ->toMatchArray(['path' => '/ai/trail', 'apiPath' => '/ai/trail/api']);
});
