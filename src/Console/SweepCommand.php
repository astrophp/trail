<?php

namespace Astro\Trail\Console;

use Astro\Trail\Facades\Trail;
use Astro\Trail\Storage\StaleRuns;
use Illuminate\Console\Command;
use Symfony\Component\Console\Attribute\AsCommand;

#[AsCommand(name: 'trail:sweep')]
class SweepCommand extends Command
{
    protected $signature = 'trail:sweep';

    protected $description = 'Mark runs that never finished as incomplete';

    public function handle(): int
    {
        $marked = Trail::store()->sweep(StaleRuns::timeout());

        $this->components->info("Marked {$marked} running ".($marked === 1 ? 'trace' : 'traces').' as incomplete.');

        return self::SUCCESS;
    }
}
