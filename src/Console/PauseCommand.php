<?php

namespace Astro\Trail\Console;

use Astro\Trail\Capture\Sampler;
use Illuminate\Console\Command;
use Symfony\Component\Console\Attribute\AsCommand;

#[AsCommand(name: 'trail:pause')]
class PauseCommand extends Command
{
    protected $signature = 'trail:pause';

    protected $description = 'Stop recording new runs, in every process';

    public function handle(Sampler $sampler): int
    {
        $sampler->pause();
        if (($warning = $sampler->localFlagWarning()) !== null) {
            $this->components->warn($warning);
        }

        $this->components->info('Recording paused. Runs already in progress will finish recording; new runs are not recorded until "trail:resume".');

        return self::SUCCESS;
    }
}
