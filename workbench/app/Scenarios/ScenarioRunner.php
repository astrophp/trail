<?php

namespace Workbench\App\Scenarios;

use Astro\Trail\Facades\Trail;
use Throwable;

/**
 * Runs scenarios, tells how each one ended and makes sure what they recorded is written.
 */
final class ScenarioRunner
{
    private readonly Mode $mode;

    public function __construct(private readonly Registry $registry, ?Mode $mode = null)
    {
        $this->mode = $mode ?? Mode::detect();
    }

    public function mode(): Mode
    {
        return $this->mode;
    }

    public function registry(): Registry
    {
        return $this->registry;
    }

    /**
     * Whether the scenario runs against the real provider in the current mode.
     */
    public function runsLive(Scenario $scenario): bool
    {
        return $this->mode->provider !== null && $scenario->supportsLive();
    }

    public function run(Scenario $scenario): Result
    {
        $live = $this->runsLive($scenario);
        $backend = $live && $this->mode->provider !== null ? Backend::live($this->mode->provider) : Backend::offline();
        $label = $live ? $this->mode->label() : 'offline';

        try {
            $backend->scoped(fn () => $scenario->run($backend));

            $result = match (true) {
                $scenario->expectedFailure() !== null => new Result($scenario->key(), Outcome::Error, 'Expected a '.class_basename($scenario->expectedFailure()).' but the run completed.', $label),
                $backend->unusedTurns() > 0 => new Result($scenario->key(), Outcome::Error, $backend->unusedTurns().' scripted responses were never requested.', $label),
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
