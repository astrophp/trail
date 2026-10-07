<?php

namespace Workbench\App\Scenarios;

/**
 * One way an agent can run, driven through the real SDK so that Trail records it.
 */
interface Scenario
{
    /** A short slug that names the scenario on the command line and in the page's forms. */
    public function key(): string;

    public function title(): string;

    /** One line on what the scenario does. */
    public function description(): string;

    /** Whether the scenario can run against a real provider; false when it needs a response the provider cannot be made to give. */
    public function supportsLive(): bool;

    /** The exception the scenario ends with when it is meant to fail, or null when it should complete. */
    public function expectedFailure(): ?string;

    public function run(Backend $backend): void;
}
