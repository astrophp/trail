<?php

namespace Astro\Trail\Console;

use Astro\Trail\Facades\Trail;
use Illuminate\Console\Command;
use Symfony\Component\Console\Attribute\AsCommand;

#[AsCommand(name: 'trail:clear')]
class ClearCommand extends Command
{
    protected $signature = 'trail:clear {--force : Do not ask for confirmation}';

    protected $description = 'Delete every recorded trace, span and bookmark (prices are kept)';

    public function handle(): int
    {
        if (! $this->option('force') && ! $this->laravel->environment('local')) {
            $this->components->warn('This deletes every recorded trace, span and bookmark.');

            if (! $this->confirm('Are you sure you want to run this command?', false)) {
                $this->components->warn('Command cancelled.');

                return self::FAILURE;
            }
        }

        Trail::store()->clear();

        $this->components->info('Deleted every trace, span and bookmark. Prices were kept.');

        return self::SUCCESS;
    }
}
