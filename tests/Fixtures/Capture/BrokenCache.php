<?php

namespace Astro\Trail\Tests\Fixtures\Capture;

use Illuminate\Contracts\Cache\Factory;
use Illuminate\Contracts\Cache\Repository;
use RuntimeException;

/**
 * A cache whose store cannot be reached.
 */
class BrokenCache implements Factory
{
    public function store($name = null): Repository
    {
        throw new RuntimeException('The cache is down.');
    }
}
