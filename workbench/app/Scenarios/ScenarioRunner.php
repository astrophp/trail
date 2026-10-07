<?php

namespace Workbench\App\Scenarios;

use Astro\Trail\Facades\Trail;
use Astro\Trail\Storage\StaleRuns;
use Throwable;

/**
 * Runs scenarios, tells how each one ended and makes sure what they recorded is written.
 */
final class ScenarioRunner
{
    private readonly ?string $provider;

    public function __construct(private readonly Registry $registry)
    {
        $this->provider = Backend::detect();
    }

    public function isLive(): bool
    {
        return $this->provider !== null;
    }

    /**
     * Where the real provider's calls go, or "offline".
     */
    public function label(): string
    {
        return $this->provider === null ? 'offline' : "live ({$this->provider})";
    }

    /**
     * Whether the scenario runs against the real provider in the current mode.
     */
    public function runsLive(Scenario $scenario): bool
    {
        return $this->provider !== null && $scenario->supportsLive();
    }

    public function run(Scenario $scenario): Result
    {
        $provider = $scenario->supportsLive() ? $this->provider : null;
        $backend = $provider === null ? Backend::offline() : Backend::live($provider);
        $label = $provider === null ? 'offline' : $this->label();

        try {
            $backend->scoped(fn () => $scenario->run($backend));

            $result = match (true) {
                $scenario->expectedFailure() !== null => new Result($scenario->key(), Outcome::Error, 'Expected a '.class_basename($scenario->expectedFailure()).' but the run completed.', $label),
                $backend->unusedTurns() > 0 => new Result($scenario->key(), Outcome::Error, $backend->unusedTurns().' scripted responses were never requested.', $label),
                $scenario->leavesRunUnfinished() => new Result($scenario->key(), Outcome::LeftRunning, 'Left running on purpose; it reads as incomplete once it is '.StaleRuns::timeout().' seconds old.', $label),
                default => new Result($scenario->key(), Outcome::Ok, 'Recorded.', $label),
            };
        } catch (Throwable $exception) {
            $expected = $scenario->expectedFailure();

            $result = $expected !== null && $exception instanceof $expected
                ? new Result($scenario->key(), Outcome::FailedAsExpected, class_basename($exception).': '.$exception->getMessage(), $label)
                : new Result($scenario->key(), Outcome::Error, class_basename($exception).': '.$exception->getMessage(), $label);
        } finally {
            Trail::flush();
        }

        return $result;
    }

    /**
     * @return list<Result>
     */
    public function runAll(): array
    {
        return array_values(array_map($this->run(...), $this->registry->all()));
    }
}
