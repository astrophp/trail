<?php

namespace App\Ai\Agents;

use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Promptable;
use Stringable;

/**
 * The only agent of the install test: a plain class, the way the SDK documents one.
 */
class ProbeAgent implements Agent
{
    use Promptable;

    public function instructions(): Stringable|string
    {
        return 'You are a probe used to check an installation.';
    }
}
