<?php

namespace Astro\Trail\Exceptions;

use Illuminate\Database\QueryException;
use RuntimeException;

/**
 * Trail could not write to its tables. It stands in for the database exception when that is
 * reported, because the database exception's message carries the values of the statement it
 * failed on, and for Trail those are prompts and tool results. Nothing is chained to it.
 */
final class RecordingFailed extends RuntimeException
{
    private const MAX_DRIVER_MESSAGE = 300;

    public static function because(QueryException $exception): self
    {
        $driver = $exception->getPrevious()?->getMessage() ?? '';
        // Some drivers follow their message with the offending value on a later line.
        $driver = mb_substr(trim((string) strtok($driver, "\n")), 0, self::MAX_DRIVER_MESSAGE);
        $code = is_array($exception->errorInfo) ? ($exception->errorInfo[1] ?? '') : '';

        return new self(sprintf(
            'Trail could not write to the database (connection [%s], SQLSTATE [%s], driver code [%s]): %s. Statement: %s',
            $exception->getConnectionName(),
            (string) $exception->getCode(),
            is_scalar($code) ? (string) $code : '',
            $driver,
            $exception->getSql(),
        ));
    }
}
