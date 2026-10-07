<?php

namespace Astro\Trail\Capture;

/**
 * What one capture has done to a value so far.
 */
final class CaptureState
{
    public bool $redacted = false;

    /** @var array<string, int> */
    public array $truncated = [];
}
