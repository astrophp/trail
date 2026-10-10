<?php

/*
 * The agents the documentation's samples name. They live in the application's namespace there, so
 * they are declared here under the same names for the samples to run unchanged.
 */

namespace App\Ai\Agents;

use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;

class SupportAgent extends AssistantAgent {}

class HealthCheckAgent extends AssistantAgent {}
