<?php

namespace Workbench\App\Scenarios;

use Illuminate\Support\Str;

/**
 * One way an agent can run, driven through the real SDK so that Trail records it.
 */
abstract class Scenario
{
    protected string $title;

    /** One line on what the scenario does. */
    protected string $description;

    /** A short slug that names the scenario on the command line and in the page's forms. */
    public function key(): string
    {
        return Str::kebab(class_basename(static::class));
    }

    public function title(): string
    {
        return $this->title;
    }

    public function description(): string
    {
        return $this->description;
    }

    /** Whether the scenario can run against a real provider; false when it needs a response the provider cannot be made to give. */
    public function supportsLive(): bool
    {
        return true;
    }

    /** The exception the scenario ends with when it is meant to fail, or null when it should complete. */
    public function expectedFailure(): ?string
    {
        return null;
    }

    /** Whether the scenario ends with a run that is deliberately never finished, left for capture to write as running. */
    public function leavesRunUnfinished(): bool
    {
        return false;
    }

    abstract public function run(Backend $backend): void;
}
