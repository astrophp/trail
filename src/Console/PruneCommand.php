<?php

namespace Astro\Trail\Console;

use Astro\Trail\Facades\Trail;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Symfony\Component\Console\Attribute\AsCommand;

#[AsCommand(name: 'trail:prune')]
class PruneCommand extends Command
{
    /** About a hundred years; keeps the cut-off a valid date. */
    private const MAX_HOURS = 876000;

    protected $signature = 'trail:prune {--hours= : Delete traces older than this many hours instead of the configured retention}';

    protected $description = 'Delete traces older than the retention period, with their spans and bookmarks';

    public function handle(): int
    {
        $option = $this->option('hours');

        if ($option === null) {
            $days = config('trail.retention');
            $hours = is_numeric($days) && $days > 0 ? (float) $days * 24 : null;

            if ($hours === null || $hours > self::MAX_HOURS) {
                $this->components->error('trail.retention must be a positive number of days, at most '.intdiv(self::MAX_HOURS, 24).'.');
                $this->line('Nothing was deleted. Use --hours for a one-off prune.');

                return self::FAILURE;
            }
        } else {
            $hours = is_numeric($option) && $option >= 0 && $option <= self::MAX_HOURS ? (float) $option : null;

            if ($hours === null) {
                $this->components->error('The --hours option must be a number between 0 and '.self::MAX_HOURS.'.');

                return self::FAILURE;
            }
        }

        $deleted = Trail::store()->prune(Carbon::now()->subSeconds((int) round($hours * 3600)));

        $this->components->info("Deleted {$deleted} ".($deleted === 1 ? 'trace' : 'traces').' older than '.$hours.' hours.');

        return self::SUCCESS;
    }
}
