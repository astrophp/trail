<?php

namespace Workbench\App\Agents;

use Laravel\Ai\Attributes\Model;
use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Promptable;
use Stringable;

/**
 * A policy researcher that runs on the shop's own model, which Trail has no price for.
 */
#[Model(self::MODEL)]
class LocalPolicyResearcher implements Agent
{
    use Promptable;

    /** A model id of the workbench's own: it matches nothing in the price list, so its steps are unpriced. */
    public const MODEL = 'northwind-local-1';

    public function instructions(): Stringable|string
    {
        return 'You research the published Northwind Outfitters policies on returns, shipping and warranty. '
            .'Answer with the rule that applies, in two sentences at most.';
    }
}
