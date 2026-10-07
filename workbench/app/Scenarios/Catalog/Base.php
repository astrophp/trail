<?php

namespace Workbench\App\Scenarios\Catalog;

use Workbench\App\Scenarios\Scenario;

/**
 * The defaults most scenarios share: they can run live and are meant to complete.
 */
abstract class Base implements Scenario
{
    public function supportsLive(): bool
    {
        return true;
    }

    public function expectedFailure(): ?string
    {
        return null;
    }
}
