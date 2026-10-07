<?php

namespace Astro\Trail\Console;

use Astro\Trail\Facades\Trail;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Symfony\Component\Console\Attribute\AsCommand;

#[AsCommand(name: 'trail:prune')]
class PruneCommand extends Command
{
    /** Used when trail.retention is not a non-negative number. */
    private const DEFAULT_RETENTION_DAYS = 14;

    /** About a hundred years; keeps the cut-off a valid date. */
    private const MAX_HOURS = 876000;

    protected $signature = 'trail:prune {--hours= : Delete traces older than this many hours instead of the configured retention}';

    protected $description = 'Delete traces older than the retention period, with their spans and bookmarks';

    public function handle(): int
    {
        $hours = $this->hours();

        if ($hours === null) {
            $this->components->error('The --hours option must be a number between 0 and '.self::MAX_HOURS.'.');

            return self::FAILURE;
        }

        $deleted = Trail::store()->prune(Carbon::now()->subSeconds((int) round($hours * 3600)));

        $this->components->info("Deleted {$deleted} ".($deleted === 1 ? 'trace' : 'traces').' older than '.(float) $hours.' hours.');

        return self::SUCCESS;
    }

    private function hours(): ?float
    {
        $option = $this->option('hours');

        if ($option === null) {
            $days = config('trail.retention');

            return (is_numeric($days) && $days >= 0 ? (float) $days : self::DEFAULT_RETENTION_DAYS) * 24;
        }

        if (! is_numeric($option) || $option < 0 || $option > self::MAX_HOURS) {
            return null;
        }

        return (float) $option;
    }
}
