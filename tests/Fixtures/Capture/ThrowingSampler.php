<?php

namespace Astro\Trail\Tests\Fixtures\Capture;

use Astro\Trail\Capture\Sampler;
use Astro\Trail\RecordingCandidate;
use Closure;
use RuntimeException;

/**
 * A sampler that fails, the way a bug in Trail's own decision code would.
 */
class ThrowingSampler extends Sampler
{
    public function records(RecordingCandidate|Closure $candidate): bool
    {
        throw new RuntimeException('The decision failed.');
    }
}
