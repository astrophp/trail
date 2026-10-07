<?php

namespace Astro\Trail\Capture;

/**
 * What one capture has done to a value so far.
 */
final class CaptureState
{
    /** The most truncated paths one span keeps. Past it the list is partial; the truncated flag stays accurate. */
    public const MAX_PATHS = 50;

    public bool $redacted = false;

    /** @var array<string, int> */
    public array $truncated = [];

    /** Whether something was cut away without an original length to report. */
    public bool $dropped = false;

    /** The characters of string content kept so far in this capture. */
    public int $kept = 0;

    /**
     * Note that the string at a path was cut from the given length.
     */
    public function truncate(string $path, int $length): void
    {
        if (count($this->truncated) < self::MAX_PATHS) {
            $this->truncated[$path] = $length;
        }
    }
}
