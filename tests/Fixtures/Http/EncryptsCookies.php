<?php

namespace Astro\Trail\Tests\Fixtures\Http;

/**
 * Gives the test application an encryption key, which the `web` middleware needs to answer a request.
 */
trait EncryptsCookies
{
    protected function getEnvironmentSetUp($app): void
    {
        $app['config']->set('app.key', 'base64:'.base64_encode(str_repeat('t', 32)));
    }
}
