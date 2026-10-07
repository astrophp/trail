<?php

namespace Astro\Trail\Exceptions;

use Astro\Trail\Capture\StoreFailure;
use RuntimeException;
use Throwable;

/**
 * Trail could not write to its tables. It stands in for whatever the store threw when that is
 * reported, because a database exception's message carries the values of the statement it failed
 * on, and for Trail those are prompts and tool results. It carries the class of the original and,
 * for a database error, its codes and the statement without its values. Nothing is chained.
 */
final class RecordingFailed extends RuntimeException
{
    public static function because(Throwable $exception): self
    {
        return new self(StoreFailure::describe($exception));
    }
}
