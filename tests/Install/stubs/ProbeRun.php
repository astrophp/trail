<?php

namespace App\Console\Commands;

use App\Ai\Agents\ProbeAgent;
use Illuminate\Console\Command;

/**
 * Runs the probe agent once against the SDK's fake: no provider key is configured, and no request
 * leaves the machine.
 */
class ProbeRun extends Command
{
    protected $signature = 'probe:run';

    protected $description = 'Run the probe agent against the SDK fake';

    public function handle(): int
    {
        ProbeAgent::fake(['Install probe answer']);

        $text = (string) (new ProbeAgent)->prompt('Is this installation recording?');

        if ($text !== 'Install probe answer') {
            $this->error("The fake answered \"{$text}\"");

            return self::FAILURE;
        }

        $this->line('probe agent answered');

        return self::SUCCESS;
    }
}
