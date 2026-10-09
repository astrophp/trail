<?php

namespace Astro\Trail\Queries;

use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Storage\StaleRuns;
use Illuminate\Database\Query\Builder;

/**
 * What the runs of a range used, read from the per-run summary the store keeps of the models of each
 * run (`trail_trace_models`) and, for the agents, from the runs themselves.
 *
 * Both reads are one statement over the runs that started in the range. The breakdown reads the groups
 * and sorts and pages them here, at most `limit` of them: those with most runs.
 */
final class UsageQuery
{
    /** The most groups one breakdown reads. */
    public const LIMIT = 1000;

    public function __construct(private readonly int $limit = self::LIMIT) {}

    /**
     * How much of the usage of the range is known, over every row of the summary: a step recorded
     * without its provider or its model included.
     *
     * @return array{steps: int, reported_steps: int, unpriced_steps: int, unpriced_tokens: ?int}
     */
    public function coverage(TimeRange $range): array
    {
        $query = self::summaries()
            ->selectRaw('sum(steps) as steps')
            ->selectRaw('sum(reported_steps) as reported_steps')
            ->selectRaw('sum(unpriced_steps) as unpriced_steps')
            ->selectRaw('sum(unpriced_tokens) as unpriced_tokens');
        $range->apply($query, 'started_at');

        $row = $query->first();
        $unpriced = $row === null ? 0 : Row::int($row, 'unpriced_steps');

        return [
            'steps' => $row === null ? 0 : Row::int($row, 'steps'),
            'reported_steps' => $row === null ? 0 : Row::int($row, 'reported_steps'),
            'unpriced_steps' => $unpriced,
            'unpriced_tokens' => $row === null ? 0 : self::unpricedTokens($unpriced, Row::nullableInt($row, 'unpriced_tokens')),
        ];
    }

    /**
     * One view of the breakdown, sorted and paged.
     */
    public function list(TimeRange $range, UsageFilters $filters, Page $page): UsageListing
    {
        $rows = match ($filters->by) {
            'agent' => $this->agents($range),
            'provider' => $this->models($range, false),
            default => $this->models($range, true),
        };

        $truncated = count($rows) > $this->limit;
        $groups = array_slice($rows, 0, $this->limit);

        usort($groups, fn (UsageGroup $a, UsageGroup $b) => self::compare($a, $b, $filters));

        return new UsageListing($filters->by, array_slice($groups, $page->offset(), $page->perPage), count($groups), $truncated, $this->limit);
    }

    /**
     * The rows of models, or of providers: the summary of the runs of the range, grouped. A row of the
     * model view needs both names, and one of the provider view a provider.
     *
     * @return list<UsageGroup> at most one more than the limit
     */
    private function models(TimeRange $range, bool $byModel): array
    {
        $query = self::summaries()->select($byModel ? ['provider', 'model'] : ['provider']);
        // The summary has one row for each run and model, and marks one row of each provider of a run.
        $query->selectRaw($byModel ? 'count(*) as runs' : 'sum(case when provider_first then 1 else 0 end) as runs')
            ->selectRaw('sum(steps) as steps')
            ->selectRaw('sum(input_tokens) as input_tokens')
            ->selectRaw('sum(output_tokens) as output_tokens')
            ->selectRaw('sum(cache_read_tokens) as cache_read_tokens')
            ->selectRaw('sum(cache_write_tokens) as cache_write_tokens')
            ->selectRaw('sum(reasoning_tokens) as reasoning_tokens')
            ->selectRaw('sum(cost) as cost_sum')
            ->selectRaw('sum(reported_steps) as reported_steps')
            ->selectRaw('sum(unpriced_steps) as unpriced_steps')
            ->selectRaw('sum(unpriced_tokens) as unpriced_tokens')
            // A step of the group is still running when the newest one is newer than the cutoff; an older one was abandoned.
            ->selectRaw('case when max(open_at) >= ? then 1 else 0 end as running', [StaleRuns::cutoffColumn()])
            ->whereNotNull('provider');
        $range->apply($query, 'started_at');

        if ($byModel) {
            $query->whereNotNull('model');
        }

        $query->groupBy($byModel ? ['provider', 'model'] : ['provider'])
            ->orderBy('runs', 'desc')->orderBy('provider');

        if ($byModel) {
            $query->orderBy('model');
        }

        $groups = [];

        foreach ($query->limit($this->limit + 1)->get() as $row) {
            $unpriced = Row::int($row, 'unpriced_steps');

            $groups[] = new UsageGroup(
                provider: Row::string($row, 'provider'),
                model: $byModel ? Row::string($row, 'model') : null,
                agent: null,
                runs: Row::int($row, 'runs'),
                steps: Row::int($row, 'steps'),
                tokens: [
                    'input' => Row::nullableInt($row, 'input_tokens'),
                    'output' => Row::nullableInt($row, 'output_tokens'),
                    'cache_read' => Row::nullableInt($row, 'cache_read_tokens'),
                    'cache_write' => Row::nullableInt($row, 'cache_write_tokens'),
                    'reasoning' => Row::nullableInt($row, 'reasoning_tokens'),
                ],
                cost: ($cost = Row::nullableFloat($row, 'cost_sum')) === null ? null : round($cost, RunFigures::PLACES),
                costUnpricedSteps: $unpriced,
                running: Row::int($row, 'running') > 0,
                reportedSteps: Row::int($row, 'reported_steps'),
                unpricedSteps: $unpriced,
                unpricedTokens: self::unpricedTokens($unpriced, Row::nullableInt($row, 'unpriced_tokens')),
            );
        }

        return $groups;
    }

    /**
     * The top-level agents of the range: their runs grouped by name, as the agents list groups them,
     * and the summary of their models grouped by the name of the run. The two are matched by the
     * database in one statement, so that its own comparison of names decides which are one agent.
     *
     * @return list<UsageGroup> at most one more than the limit
     */
    private function agents(TimeRange $range): array
    {
        $runs = Trace::query()->toBase()->select('name');
        RunFigures::select($runs);
        $runs->selectRaw('count(*) as run_count');
        $range->apply($runs, 'started_at');
        $runs->groupBy('name');

        $steps = self::summaries()->select('run_name')
            ->selectRaw('sum(steps) as steps')
            ->selectRaw('sum(reported_steps) as reported_steps')
            ->selectRaw('sum(unpriced_steps) as unpriced_steps')
            ->selectRaw('sum(unpriced_tokens) as unpriced_tokens');
        $range->apply($steps, 'started_at');
        $steps->groupBy('run_name');

        $query = $runs->newQuery()->fromSub($runs, 't')
            ->leftJoinSub($steps, 'm', 'm.run_name', '=', 't.name')
            ->select('t.*')
            ->addSelect('m.steps', 'm.reported_steps', 'm.unpriced_steps', 'm.unpriced_tokens')
            ->orderBy('t.run_count', 'desc')->orderBy('t.name');

        $groups = [];

        foreach ($query->limit($this->limit + 1)->get() as $row) {
            $figures = RunFigures::fromRow($row);
            $unpriced = Row::int($row, 'unpriced_steps');

            $groups[] = new UsageGroup(
                provider: null,
                model: null,
                agent: Row::string($row, 'name'),
                runs: $figures->runs['all'],
                steps: Row::int($row, 'steps'),
                tokens: $figures->tokens,
                cost: $figures->costAmount(),
                costUnpricedSteps: $figures->unpricedSpans,
                running: $figures->runs['running'] > 0,
                reportedSteps: Row::int($row, 'reported_steps'),
                unpricedSteps: $unpriced,
                unpricedTokens: self::unpricedTokens($unpriced, Row::nullableInt($row, 'unpriced_tokens')),
            );
        }

        return $groups;
    }

    /**
     * Nothing unpriced is no tokens; unpriced steps that reported neither input nor output are unknown.
     */
    private static function unpricedTokens(int $unpricedSteps, ?int $sum): ?int
    {
        return $unpricedSteps === 0 ? 0 : $sum;
    }

    private static function summaries(): Builder
    {
        return Trace::query()->toBase()->newQuery()->from('trail_trace_models');
    }

    /**
     * Rows without the sorted value come last whichever the direction; equal values are ordered by
     * name in the direction of the sort, so that a page never repeats or skips a row.
     */
    private static function compare(UsageGroup $a, UsageGroup $b, UsageFilters $filters): int
    {
        $direction = $filters->descending ? -1 : 1;
        $one = $filters->sort === 'name' ? 0 : $a->sortValue($filters->sort);
        $other = $filters->sort === 'name' ? 0 : $b->sortValue($filters->sort);

        if (($one === null) !== ($other === null)) {
            return $one === null ? 1 : -1;
        }

        $order = $one <=> $other;

        return $direction * ($order !== 0 ? $order : self::byName($a, $b));
    }

    private static function byName(UsageGroup $a, UsageGroup $b): int
    {
        foreach ($a->nameParts() as $index => $part) {
            $order = self::text($part, $b->nameParts()[$index] ?? '');

            if ($order !== 0) {
                return $order;
            }
        }

        return 0;
    }

    private static function text(string $a, string $b): int
    {
        return strcmp(mb_strtolower($a), mb_strtolower($b)) ?: strcmp($a, $b);
    }
}
