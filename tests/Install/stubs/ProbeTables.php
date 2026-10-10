<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Schema;

/**
 * Prints the name of every table in the database, one per line.
 */
class ProbeTables extends Command
{
    protected $signature = 'probe:tables';

    protected $description = 'Print the names of the database tables';

    public function handle(): int
    {
        foreach (Schema::getTables() as $table) {
            $this->line($table['name']);
        }

        return self::SUCCESS;
    }
}
