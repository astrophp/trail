<?php

namespace Astro\Trail\Storage;

use Astro\Trail\Enums\IssueKind;
use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\Contracts\TraceStore;
use DateTimeInterface;
use Illuminate\Support\Carbon;

/**
 * The single definition of a stale run: a running trace or span first stored
 * strictly before the cutoff. The sweep writes it to the database; every read
 * applies it, so an unswept row already reports what the sweep would write.
 */
final class StaleRuns
{
    public const DATE_FORMAT = 'Y-m-d H:i:s.v';

    /** Used when trail.stale_after is not a number. */
    public const DEFAULT_TIMEOUT_SECONDS = 3600;

    /**
     * The configured timeout in seconds, never below the store's minimum.
     */
    public static function timeout(): int
    {
        $configured = config('trail.stale_after');

        return self::floor(is_numeric($configured) ? (int) $configured : self::DEFAULT_TIMEOUT_SECONDS);
    }

    /**
     * The moment before which a running row is stale: now minus the given
     * timeout (the configured one by default), raised to the minimum.
     */
    public static function cutoff(?int $timeoutSeconds = null): Carbon
    {
        return Carbon::now()->subSeconds(self::floor($timeoutSeconds ?? self::timeout()));
    }

    /**
     * The cutoff as the string to bind against a datetime column.
     */
    public static function cutoffColumn(?int $timeoutSeconds = null): string
    {
        return self::format(self::cutoff($timeoutSeconds));
    }

    /**
     * Format a moment for a datetime column. The query builder formats a bound
     * date without milliseconds, which on SQLite (text comparison) drops rows
     * inside the boundary second, so dates are always bound as these strings.
     */
    public static function format(DateTimeInterface $moment): string
    {
        $timezone = config('app.timezone');

        return Carbon::instance($moment)
            ->setTimezone(is_string($timezone) ? $timezone : 'UTC')
            ->format(self::DATE_FORMAT);
    }

    public static function isStale(Status $status, ?DateTimeInterface $createdAt): bool
    {
        return $status === Status::Running
            && $createdAt !== null
            && self::format($createdAt) < self::cutoffColumn();
    }

    public static function effectiveStatus(Status $status, ?DateTimeInterface $createdAt): Status
    {
        return self::isStale($status, $createdAt) ? Status::Incomplete : $status;
    }

    public static function effectiveIssueKind(Status $status, ?DateTimeInterface $createdAt, ?IssueKind $issueKind): ?IssueKind
    {
        return self::isStale($status, $createdAt) ? IssueKind::Abandoned : $issueKind;
    }

    private static function floor(int $seconds): int
    {
        return max(TraceStore::MINIMUM_STALE_SECONDS, $seconds);
    }
}
