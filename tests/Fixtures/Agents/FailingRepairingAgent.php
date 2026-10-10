<?php

namespace Astro\Trail\Tests\Fixtures\Agents;

use Laravel\Ai\Attributes\MaxSteps;
use Laravel\Ai\Attributes\RepairToolCalls;

/**
 * An agent that asks the SDK to answer calls to unknown tools instead of failing the run.
 */
#[RepairToolCalls]
#[MaxSteps(2)]
class FailingRepairingAgent extends AssistantAgent {}
