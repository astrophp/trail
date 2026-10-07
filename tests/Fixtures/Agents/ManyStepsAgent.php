<?php

namespace Astro\Trail\Tests\Fixtures\Agents;

use Laravel\Ai\Attributes\MaxSteps;

/**
 * An agent whose step budget is far above anything a test script uses, for runs of hundreds of steps.
 */
#[MaxSteps(1000)]
class ManyStepsAgent extends AssistantAgent {}
