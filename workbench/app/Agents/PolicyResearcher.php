<?php

namespace Workbench\App\Agents;

use Laravel\Ai\Attributes\UseCheapestModel;
use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Promptable;
use Stringable;

/**
 * A sub-agent the support assistant hands policy questions to.
 */
#[UseCheapestModel]
class PolicyResearcher implements Agent
{
    use Promptable;

    public function instructions(): Stringable|string
    {
        return 'You research the published Northwind Outfitters policies on returns, shipping and warranty. '
            .'Answer with the rule that applies, in two sentences at most.';
    }
}
