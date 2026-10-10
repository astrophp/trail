<?php

namespace Astro\Trail\Tests\Fixtures\Pricing;

use Illuminate\Database\ConnectionInterface;
use Illuminate\Database\ConnectionResolverInterface;
use RuntimeException;

class FlakyResolver implements ConnectionResolverInterface
{
    public bool $failing = true;

    public function __construct(private readonly ConnectionResolverInterface $inner) {}

    public function connection($name = null): ConnectionInterface
    {
        if ($this->failing) {
            throw new RuntimeException('Connection refused.');
        }

        return $this->inner->connection($name);
    }

    public function getDefaultConnection(): string
    {
        return $this->inner->getDefaultConnection();
    }

    public function setDefaultConnection($name): void
    {
        $this->inner->setDefaultConnection($name);
    }
}
