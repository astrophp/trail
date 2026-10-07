<?php

namespace Astro\Trail\Capture;

use Illuminate\Database\DetectsLostConnections;
use Illuminate\Database\LostConnectionException;
use Illuminate\Database\QueryException;
use PDOException;
use Throwable;

/**
 * What a failure of Trail's own store calls says, read without trusting its message: a database
 * exception's message carries the values of the statement that failed, which for Trail are prompts
 * and tool results. Only its codes and class are looked at when it is reported, and only codes and
 * the text of the driver's own connection errors (which hold no values) decide whether the database
 * can be written to at all.
 */
final class StoreFailure
{
    use DetectsLostConnections;

    /** The longest the message of a failure that is not a database exception is reported at. */
    private const MAX_MESSAGE = 300;

    private const MAX_CHAIN = 16;

    /**
     * The MySQL client errors for a connection that cannot be made or is gone, and for credentials
     * and a database that are refused: access denied, unknown database, cannot connect, gone away, lost.
     */
    private const UNAVAILABLE_CODES = [1044, 1045, 1049, 2002, 2003, 2006, 2013, 2054];

    /**
     * Whether the failure means no write can succeed: the connection is lost or refused, the
     * credentials or the database are refused, or Trail's tables do not exist. Everything else, data,
     * a constraint, a deadlock, a serialisation failure, a lock timeout, a statement or row that is too
     * large, a syntax error, fails only its own trace.
     */
    public static function meansUnavailable(Throwable $e): bool
    {
        $driver = null;

        foreach (self::chain($e) as $link) {
            if ($link instanceof LostConnectionException) {
                return true;
            }

            // The messages of the wrappers hold the SQL with its values; the driver's own message does not.
            if (! ($link instanceof QueryException) && $link instanceof PDOException) {
                $driver ??= $link;
            }
        }

        $driver ??= $e instanceof PDOException ? $e : null;

        if ($driver !== null && (new self)->causedByLostConnection($driver)) {
            return true;
        }

        $query = self::query($e);
        $state = self::state($query ?? $driver);
        $code = self::code($query ?? $driver);
        $text = $driver === null ? '' : strtolower($driver->getMessage());

        return str_starts_with($state, '08')
            || str_starts_with($state, '28')
            || in_array($state, ['3D000', '42S02', '42P01'], true)
            || in_array($code, self::UNAVAILABLE_CODES, true)
            // SQLite reports a missing table and a file it cannot open as a general error.
            || str_contains($text, 'no such table')
            || str_contains($text, 'unable to open database file');
    }

    /**
     * What may be reported of a failure: its class, and for a database exception its connection,
     * SQLSTATE, driver error code and the SQL of the statement with its placeholders, never its values.
     * Another exception keeps its own message, cut short: the store raises those about ids, and they
     * name no payload.
     */
    public static function describe(Throwable $e): string
    {
        $class = explode("\0", $e::class)[0];
        $query = self::query($e);

        if ($query === null && ! ($e instanceof PDOException)) {
            return sprintf('Trail could not write: %s: %s', $class, mb_substr($e->getMessage(), 0, self::MAX_MESSAGE));
        }

        $source = $query ?? $e;

        return sprintf(
            'Trail could not write to the database (%s; connection [%s], SQLSTATE [%s], driver code [%s])%s',
            $class,
            $query?->getConnectionName() ?? '',
            self::state($source),
            self::code($source) ?? '',
            $query === null ? '.' : '. Statement: '.$query->getSql(),
        );
    }

    /**
     * The first query exception in the failure or what it wraps, which holds the statement and codes.
     */
    private static function query(Throwable $e): ?QueryException
    {
        foreach (self::chain($e) as $link) {
            if ($link instanceof QueryException) {
                return $link;
            }
        }

        return null;
    }

    /**
     * @return list<Throwable>
     */
    private static function chain(Throwable $e): array
    {
        $links = [];

        for ($depth = 0; $e !== null && $depth < self::MAX_CHAIN; $depth++) {
            $links[] = $e;
            $e = $e->getPrevious();
        }

        return $links;
    }

    private static function state(?Throwable $e): string
    {
        if ($e === null) {
            return '';
        }

        $info = $e instanceof PDOException ? $e->errorInfo : null;

        if (is_array($info) && is_string($info[0] ?? null)) {
            return $info[0];
        }

        if (is_string($e->getCode()) && ! is_numeric($e->getCode())) {
            return $e->getCode();
        }

        // A connection that failed has no error info; the driver puts the state at the start of its message.
        return preg_match('/^SQLSTATE\[([0-9A-Za-z]{5})\]/', $e->getMessage(), $match) === 1 ? $match[1] : '';
    }

    private static function code(?Throwable $e): ?int
    {
        if ($e === null) {
            return null;
        }

        $info = $e instanceof PDOException ? $e->errorInfo : null;

        if (is_array($info) && is_int($info[1] ?? null)) {
            return $info[1];
        }

        if (is_int($e->getCode()) && $e->getCode() !== 0) {
            return $e->getCode();
        }

        // A connection error gives its driver code in the message: "SQLSTATE[HY000] [2002] Connection refused".
        return preg_match('/^SQLSTATE\[[0-9A-Za-z]{5}\] \[(\d+)\]/', $e->getMessage(), $match) === 1 ? (int) $match[1] : null;
    }
}
