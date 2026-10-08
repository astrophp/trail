<?php

namespace Astro\Trail\Queries;

use Astro\Trail\Enums\IssueKind;
use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Storage\StaleRuns;
use DateTimeImmutable;
use DateTimeZone;
use stdClass;
use Throwable;

/**
 * The runs of a range that someone should look at, by kind, read in one aggregate query over the
 * runs: a count and the latest start for each kind and, among the failed runs, for each issue
 * kind. Every count is the `pagination.total` of the runs list with the item's filters, because
 * every condition is the list's own, the stale rule included.
 */
final class AttentionQuery
{
    /**
     * @return list<AttentionItem> the kinds with at least one run, in the order of AttentionKind
     */
    public function read(TimeRange $range, RunScope $scope): array
    {
        $cutoff = StaleRuns::cutoffColumn();

        $aggregates = [];

        foreach (AttentionKind::cases() as $kind) {
            $aggregates["kind_{$kind->value}"] = $kind->condition($cutoff);
        }

        // A failed run is never stale, so its stored issue kind is the one the list filters on.
        foreach (IssueKind::cases() as $issueKind) {
            $aggregates["issue_{$issueKind->value}"] = ['(status = ? and issue_kind = ?)', [Status::Failed->value, $issueKind->value]];
        }

        $query = Trace::query()->toBase();

        foreach ($aggregates as $name => [$condition, $bindings]) {
            $query->selectRaw('count(case when '.$condition.' then 1 end) as '.$name, $bindings);
            $query->selectRaw('max(case when '.$condition.' then started_at end) as '.$name.'_latest', $bindings);
        }

        $range->apply($query, 'started_at');
        $scope->apply($query);

        $row = $query->first() ?? new stdClass;

        $items = [];

        foreach (AttentionKind::cases() as $kind) {
            $found = self::found($row, "kind_{$kind->value}");

            if ($found !== null) {
                $items[] = new AttentionItem(
                    kind: $kind,
                    count: $found['count'],
                    latestAt: $found['latest'],
                    filters: $kind->filters(),
                    breakdown: $kind === AttentionKind::Failed ? self::breakdown($row, $kind) : [],
                );
            }
        }

        return $items;
    }

    /**
     * The failed runs by issue kind, the most first and the order of the enum among equals. A
     * failed run without an issue kind is in no row: the list has no filter for it.
     *
     * @return list<AttentionRow>
     */
    private static function breakdown(stdClass $row, AttentionKind $kind): array
    {
        $rows = [];

        foreach (IssueKind::cases() as $issueKind) {
            $found = self::found($row, "issue_{$issueKind->value}");

            if ($found !== null) {
                $rows[] = new AttentionRow($issueKind, $found['count'], $found['latest'], [...$kind->filters(), 'issue_kind' => $issueKind->value]);
            }
        }

        // The sort is stable, so rows with equal counts keep the order of the enum.
        usort($rows, fn (AttentionRow $a, AttentionRow $b) => $b->count <=> $a->count);

        return $rows;
    }

    /**
     * @return array{count: int, latest: DateTimeImmutable}|null null when no run is of it
     */
    private static function found(stdClass $row, string $name): ?array
    {
        $count = $row->{$name} ?? null;
        $latest = self::moment($row->{$name.'_latest'} ?? null);

        return is_numeric($count) && (int) $count > 0 && $latest !== null ? ['count' => (int) $count, 'latest' => $latest] : null;
    }

    /**
     * A stored start time, which is in the application's timezone.
     */
    private static function moment(mixed $stored): ?DateTimeImmutable
    {
        if (! is_string($stored)) {
            return null;
        }

        $timezone = config('app.timezone');

        try {
            return new DateTimeImmutable($stored, new DateTimeZone(is_string($timezone) ? $timezone : 'UTC'));
        } catch (Throwable) {
            return null;
        }
    }
}
