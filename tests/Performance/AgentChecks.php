<?php

namespace Astro\Trail\Tests\Performance;

use Astro\Trail\Queries\BucketUnit;
use Astro\Trail\Queries\TimeRange;
use Astro\Trail\Queries\TraceFilters;
use Astro\Trail\Queries\TraceIndex;
use Illuminate\Database\Connection;

/**
 * Whether the candidate reads agree with each other and with the runs list's own counts, on one
 * seeded dataset. A disagreement is a finding for the report, never hidden.
 */
final class AgentChecks
{
    /** @var list<string> */
    public array $findings = [];

    private string $label = '';

    public function __construct(private readonly Connection $db, private readonly AgentReads $reads) {}

    /**
     * @return list<string> the findings of this range
     */
    public function run(TimeRange $range, string $label): array
    {
        $this->findings = [];
        $this->label = $label;

        $top = $this->reads->topLevel($range);

        $this->statusTotals($top, $range);
        $this->perAgent($top, $range);
        $this->delegatedVariants($range);
        $this->combined($range);
        $this->percentiles($top, $range);
        $this->series($top, $range);
        $this->models($range);
        $this->callers($range);

        return $this->findings;
    }

    /**
     * @param  list<array<string, mixed>>  $top
     */
    private function statusTotals(array $top, TimeRange $range): void
    {
        $expected = (new TraceIndex)->statusCounts($range, new TraceFilters, null);
        $sum = fn (string $column): int => (int) array_sum(array_map(fn (array $row) => (int) $row[$column], $top));

        $found = ['all' => $sum('runs'), 'completed' => $sum('completed'), 'failed' => $sum('failed'), 'incomplete' => $sum('incomplete'), 'running' => $sum('running'), 'awaiting_approval' => $sum('awaiting_approval')];

        $this->expect($found === $expected, 'A: the per-agent status counts add up to '.json_encode($found).' but TraceIndex::statusCounts is '.json_encode($expected));
    }

    /**
     * @param  list<array<string, mixed>>  $top
     */
    private function perAgent(array $top, TimeRange $range): void
    {
        foreach ($top as $row) {
            $name = (string) $row['name'];
            $counts = (new TraceIndex)->statusCounts($range, new TraceFilters(agent: $name), null);
            $found = ['all' => (int) $row['runs'], 'completed' => (int) $row['completed'], 'failed' => (int) $row['failed'], 'incomplete' => (int) $row['incomplete'], 'running' => (int) $row['running'], 'awaiting_approval' => (int) $row['awaiting_approval']];

            $this->expect($found === $counts, "A: {$name} counts ".json_encode($found).' but the list counts '.json_encode($counts));
        }
    }

    private function delegatedVariants(TimeRange $range): void
    {
        $in = self::byName($this->reads->delegated($range, 'in'));

        foreach (['join', 'bounded'] as $variant) {
            $this->expect(self::same($in, self::byName($this->reads->delegated($range, $variant))), "B: the {$variant} bounding differs from the semi-join");
        }
    }

    private function combined(TimeRange $range): void
    {
        $union = self::byName($this->reads->combinedPage($range, 'runs')['rows']);
        $merged = self::byName($this->reads->merged($range));

        $this->expect(self::same($union, $merged), 'C: the union all read differs from A merged with B in PHP: '.json_encode(array_keys($union)).' against '.json_encode(array_keys($merged)));
    }

    /**
     * @param  list<array<string, mixed>>  $top
     */
    private function percentiles(array $top, TimeRange $range): void
    {
        $names = array_map(fn (array $row) => (string) $row['name'], array_slice($top, 0, AgentReads::PAGE));
        $measured = [];

        foreach ($top as $row) {
            $measured[(string) $row['name']] = (int) $row['measured'];
        }

        $offsets = self::byName($this->reads->p95Offsets($range, $measured));

        $this->expect(self::same(self::byName($this->reads->p95Window($range, null)), $offsets), 'D: the window read differs from the offset reads for all agents');
        $this->expect(self::same(self::byName($this->reads->p95Window($range, $names)), array_intersect_key($offsets, array_flip($names))), 'D: the window read differs from the offset reads for the agents of a page');
    }

    /**
     * @param  list<array<string, mixed>>  $top
     */
    private function series(array $top, TimeRange $range): void
    {
        $names = array_map(fn (array $row) => (string) $row['name'], $top);
        $cuts = BucketUnit::for($range)->buckets($range);
        $perAgent = [];

        foreach ($this->reads->series($range, $names, $cuts) as $row) {
            $perAgent[(string) $row['name']] = ($perAgent[(string) $row['name']] ?? 0) + (int) $row['runs'];
        }

        foreach ($top as $row) {
            $this->expect(($perAgent[(string) $row['name']] ?? 0) === (int) $row['runs'], "E: the buckets of {$row['name']} add up to ".($perAgent[(string) $row['name']] ?? 0)." but it has {$row['runs']} runs");
        }
    }

    private function models(TimeRange $range): void
    {
        foreach ([AgentMeasurement::BIG_AGENT, OverviewFixture::SCOPED_AGENT] as $agent) {
            foreach ($this->reads->modelsOf($agent, $range) as $row) {
                $listed = (new TraceIndex)->count($range, new TraceFilters(agent: $agent, provider: (string) $row['provider'], model: (string) $row['model']), null);

                $this->expect((int) $row['runs'] === $listed, "F: {$agent} used {$row['provider']}/{$row['model']} in {$row['runs']} runs but the list counts {$listed}");
            }
        }
    }

    private function callers(TimeRange $range): void
    {
        foreach ([array_key_first(SpanFixture::TOOLS), array_key_last(SpanFixture::TOOLS)] as $tool) {
            $found = $this->reads->calling((string) $tool, $range);

            $brute = $this->db->table('trail_traces as t')->join('trail_spans as s', 's.trace_id', '=', 't.id')
                ->where('s.type', 'tool')->where('s.name', $tool);
            $range->apply($brute, 't.started_at');

            $count = (int) ($brute->clone()->selectRaw('count(distinct t.id) as total')->first()->total ?? 0);
            $ids = array_map(fn (object $row) => (string) $row->id, $brute->clone()->select('t.id', 't.started_at')->distinct()->orderByDesc('t.started_at')->orderByDesc('t.id')->limit(AgentReads::PAGE)->get()->all());

            $this->expect($found['count'] === $count, "I: the filter counts {$found['count']} runs for {$tool} but a join counts {$count}");
            $this->expect(array_column($found['rows'], 'id') === $ids, "I: the first page for {$tool} differs from a join's");
        }
    }

    private function expect(bool $holds, string $finding): void
    {
        if (! $holds) {
            $this->findings[] = "{$this->label}: {$finding}.";
        }
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     * @return array<string, array<string, mixed>>
     */
    private static function byName(array $rows): array
    {
        $byName = [];

        foreach ($rows as $row) {
            $byName[(string) $row['name']] = $row;
        }

        ksort($byName);

        return $byName;
    }

    /**
     * Rows are equal when every value is, numbers compared as numbers (drivers return them as strings or floats).
     *
     * @param  array<string, array<string, mixed>>  $a
     * @param  array<string, array<string, mixed>>  $b
     */
    private static function same(array $a, array $b): bool
    {
        if (array_keys($a) !== array_keys($b)) {
            return false;
        }

        foreach ($a as $name => $row) {
            foreach ($row as $column => $value) {
                if (self::normal($value, $column) !== self::normal($b[$name][$column] ?? null, $column)) {
                    return false;
                }
            }
        }

        return true;
    }

    private static function normal(mixed $value, string $column): mixed
    {
        if ($value === null || $column === 'latest' || $column === 'delegated_latest') {
            return $value === null ? null : substr((string) $value, 0, 23);
        }

        return is_numeric($value) ? round((float) $value, 4) : $value;
    }
}
