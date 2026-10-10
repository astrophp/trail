<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Route;

/**
 * Prints the name of every registered route whose name starts with "trail.", one per line.
 */
class ProbeRoutes extends Command
{
    protected $signature = 'probe:routes';

    protected $description = 'Print the names of the registered Trail routes';

    public function handle(): int
    {
        foreach (Route::getRoutes() as $route) {
            $name = $route->getName();

            if (is_string($name) && str_starts_with($name, 'trail.')) {
                $this->line($name);
            }
        }

        return self::SUCCESS;
    }
}
