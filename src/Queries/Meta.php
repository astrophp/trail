<?php

namespace Astro\Trail\Queries;

use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\Models\Span;
use Astro\Trail\Storage\Models\Trace;
use Illuminate\Database\Eloquent\Builder;

/**
 * What the dashboard needs around every page: whether anything is recorded, what is running, and
 * the values its filters offer.
 */
final class Meta
{
    public const FILTER_LIMIT = 100;

    public function anyTraces(): bool
    {
        return Trace::query()->exists();
    }

    /**
     * Runs in flight now, without the stale ones, which count as incomplete.
     */
    public function runningCount(): int
    {
        return Trace::query()->whereEffectiveStatus(Status::Running)->count();
    }

    /**
     * @return list<string>
     */
    public function agents(TimeRange $range): array
    {
        return array_values($this->traces($range)->distinct()->orderBy('name')->limit(self::FILTER_LIMIT)->get(['name'])->map(fn (Trace $trace) => $trace->name)->all());
    }

    /**
     * @return list<string>
     */
    public function providers(TimeRange $range): array
    {
        return array_values($this->spans($range)->distinct()->orderBy('provider')->limit(self::FILTER_LIMIT)->get(['provider'])->map(fn (Span $span) => (string) $span->provider)->all());
    }

    /**
     * @return list<array{provider: string, model: string}>
     */
    public function models(TimeRange $range): array
    {
        $spans = $this->spans($range)->whereNotNull('model')->distinct()->orderBy('provider')->orderBy('model')->limit(self::FILTER_LIMIT)->get(['provider', 'model']);

        return array_values($spans->map(fn (Span $span) => ['provider' => (string) $span->provider, 'model' => (string) $span->model])->all());
    }

    /**
     * @return Builder<Trace>
     */
    private function traces(TimeRange $range): Builder
    {
        $query = Trace::query();
        $range->apply($query, 'started_at');

        return $query;
    }

    /**
     * The spans of the runs that started in the range, reached through the runs: spans have no
     * index on their own start, and a range is always about when the run started.
     *
     * @return Builder<Span>
     */
    private function spans(TimeRange $range): Builder
    {
        return Span::query()->whereIn('trace_id', $this->traces($range)->select('id'))->whereNotNull('provider');
    }
}
