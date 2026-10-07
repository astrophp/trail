<?php

namespace Astro\Trail\Tests\Fixtures\Capture;

use Astro\Trail\Capture\Recorder;
use Laravel\Ai\Events\ProviderFailedOver;

/**
 * A recorder that counts the provider failovers it is told about, to show which events reach it.
 */
class FailoverSpyRecorder extends Recorder
{
    public int $failovers = 0;

    public function providerFailedOver(ProviderFailedOver $event): void
    {
        $this->failovers++;

        parent::providerFailedOver($event);
    }
}
