<?php

namespace Astro\Trail\Storage\Models\Concerns;

use Astro\Trail\Enums\IssueKind;
use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\StaleRuns;
use DateTimeInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * Applies the stale-run rule to a row and to queries over rows: a running row
 * older than the timeout is incomplete and abandoned, as if it had been swept.
 *
 * @phpstan-require-extends Model
 */
trait ResolvesStaleRuns
{
    /**
     * Whether this row is still marked running although it is past the timeout.
     */
    public function isStale(): bool
    {
        $status = $this->getAttribute('status');

        return $status instanceof Status && StaleRuns::isStale($status, $this->createdAt());
    }

    /**
     * The status to show: incomplete for a stale running row, else the stored one.
     */
    public function effectiveStatus(): Status
    {
        $status = $this->getAttribute('status');

        return $status instanceof Status
            ? StaleRuns::effectiveStatus($status, $this->createdAt())
            : Status::Running;
    }

    /**
     * The issue kind to show: abandoned for a stale running row, else the stored one.
     */
    public function effectiveIssueKind(): ?IssueKind
    {
        $status = $this->getAttribute('status');
        $kind = $this->getAttribute('issue_kind');

        return $status instanceof Status
            ? StaleRuns::effectiveIssueKind($status, $this->createdAt(), $kind instanceof IssueKind ? $kind : null)
            : null;
    }

    /**
     * Rows whose effective status is the given one.
     *
     * @param  Builder<static>  $query
     */
    public function scopeEffectiveStatus(Builder $query, Status $status): void
    {
        $column = $query->qualifyColumn('status');
        $created = $query->qualifyColumn('created_at');
        $cutoff = StaleRuns::cutoffColumn();

        $query->where(function (Builder $query) use ($status, $column, $created, $cutoff) {
            match ($status) {
                Status::Running => $query->where($column, Status::Running->value)
                    ->where($created, '>=', $cutoff),
                Status::Incomplete => $query->where($column, Status::Incomplete->value)
                    ->orWhere(fn (Builder $stale) => $stale->where($column, Status::Running->value)->where($created, '<', $cutoff)),
                default => $query->where($column, $status->value),
            };
        });
    }

    /**
     * Rows whose effective issue kind is the given one.
     *
     * @param  Builder<static>  $query
     */
    public function scopeEffectiveIssueKind(Builder $query, IssueKind $kind): void
    {
        $column = $query->qualifyColumn('issue_kind');
        $status = $query->qualifyColumn('status');
        $created = $query->qualifyColumn('created_at');
        $cutoff = StaleRuns::cutoffColumn();

        $query->where(function (Builder $query) use ($kind, $column, $status, $created, $cutoff) {
            if ($kind === IssueKind::Abandoned) {
                $query->where($column, $kind->value)
                    ->orWhere(fn (Builder $stale) => $stale->where($status, Status::Running->value)->where($created, '<', $cutoff));

                return;
            }

            $query->where($column, $kind->value)
                ->where(fn (Builder $fresh) => $fresh->where($status, '!=', Status::Running->value)->orWhere($created, '>=', $cutoff));
        });
    }

    private function createdAt(): ?DateTimeInterface
    {
        $createdAt = $this->getAttribute('created_at');

        return $createdAt instanceof DateTimeInterface ? $createdAt : null;
    }
}
