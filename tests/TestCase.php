<?php

namespace Astro\Trail\Tests;

use Astro\Trail\TrailServiceProvider;
use Laravel\Ai\AiServiceProvider;
use Orchestra\Testbench\TestCase as Orchestra;

abstract class TestCase extends Orchestra
{
    protected function getPackageProviders($app): array
    {
        return [
            AiServiceProvider::class,
            TrailServiceProvider::class,
        ];
    }
}
