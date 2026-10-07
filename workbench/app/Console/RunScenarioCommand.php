<?php

namespace Workbench\App\Console;

use Illuminate\Console\Command;
use Symfony\Component\Console\Attribute\AsCommand;
use Workbench\App\Scenarios\Outcome;
use Workbench\App\Scenarios\Registry;
use Workbench\App\Scenarios\Result;
use Workbench\App\Scenarios\Scenario;
use Workbench\App\Scenarios\ScenarioRunner;

#[AsCommand(name: 'workbench:run')]
class RunScenarioCommand extends Command
{
    protected $signature = 'workbench:run {scenario? : The key of the scenario to run} {--all : Run every scenario} {--list : List the scenarios without running them}';

    protected $description = 'Run capture scenarios through the real SDK so that Trail records them';

    public function handle(ScenarioRunner $runner, Registry $registry): int
    {
        $this->components->info('Mode: '.$runner->mode()->label());

        if ($this->option('list')) {
            foreach ($registry->all() as $scenario) {
                $this->line(sprintf('  %-22s %s%s', $scenario->key(), $scenario->description(), $scenario->supportsLive() ? '' : ' (always offline)'));
            }

            return self::SUCCESS;
        }

        $key = $this->argument('scenario');

        if ($key === null && ! $this->option('all')) {
            $this->components->error('Name a scenario, or pass --all or --list.');

            return self::INVALID;
        }

        if ($key !== null && ! $registry->has($key)) {
            $this->components->error("Unknown scenario [{$key}]. Run with --list to see them.");

            return self::INVALID;
        }

        $scenarios = $key === null ? $registry->all() : [$key => $registry->get($key)];
        $failed = false;

        foreach ($scenarios as $scenario) {
            $result = $runner->run($scenario);
            $failed = $failed || ! $result->outcome->isGood();

            $this->report($scenario, $result);
        }

        return $failed ? self::FAILURE : self::SUCCESS;
    }

    private function report(Scenario $scenario, Result $result): void
    {
        $line = sprintf('%-22s [%s] %s: %s', $scenario->key(), $result->mode, $result->outcome->value, $result->message);

        $result->outcome === Outcome::Error ? $this->components->error($line) : $this->line($line);
    }
}
