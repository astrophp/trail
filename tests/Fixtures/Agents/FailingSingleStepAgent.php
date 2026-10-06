<?php

namespace Astro\Trail\Tests\Fixtures\Agents;

use Laravel\Ai\Attributes\MaxSteps;

/**
 * An agent with a one step budget, so its only step is the final step and tools are not run.
 */
#[MaxSteps(1)]
class FailingSingleStepAgent extends AssistantAgent {}
