<?php

namespace Astro\Trail\Console;

use Astro\Trail\Capture\Sampler;
use Illuminate\Console\Command;
use Symfony\Component\Console\Attribute\AsCommand;

#[AsCommand(name: 'trail:resume')]
class ResumeCommand extends Command
{
    protected $signature = 'trail:resume';

    protected $description = 'Start recording new runs again after "trail:pause"';

    public function handle(Sampler $sampler): int
    {
        $sampler->resume();

        $this->components->info('Recording resumed.');

        return self::SUCCESS;
    }
}
