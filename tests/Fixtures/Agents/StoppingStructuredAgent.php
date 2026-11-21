<?php

namespace Astro\Trail\Tests\Fixtures\Agents;

use Laravel\Ai\Contracts\HasMiddleware;
use Laravel\Ai\Middleware\Stop;
use Laravel\Ai\PendingStep;

/**
 * A structured agent whose middleware ends the run before its second step.
 */
class StoppingStructuredAgent extends StructuredAgent implements HasMiddleware
{
    public function middleware(): array
    {
        return [
            Stop::unless(fn (PendingStep $step): bool => $step->isFirstStep()),
        ];
    }
}
