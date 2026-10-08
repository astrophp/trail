<?php

namespace Astro\Trail\Tests\Performance;

use Astro\Trail\Queries\OverviewQuery;
use Astro\Trail\Queries\RunScope;
use Astro\Trail\Queries\TimeRange;
use Astro\Trail\Queries\TraceFilters;
use Astro\Trail\Queries\TraceIndex;
use Astro\Trail\Storage\StaleRuns;
use Carbon\CarbonImmutable;
use Illuminate\Database\Connection;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Times the candidate query shapes of the overview on the databases the package supports and
 * checks that they agree. Driven by environment variables; see OverviewQueriesTest.
 */
final class OverviewMeasurement
{
    /** @var array<string, array{unit: string, seconds: int, buckets: int}> */
    private const RANGES = [
        '1h' => ['unit' => '5 minutes', 'seconds' => 3600, 'buckets' => 13],
        '24h' => ['unit' => 'hour', 'seconds' => 86400, 'buckets' => 25],
        '7d' => ['unit' => 'day', 'seconds' => 604800, 'buckets' => 8],
    ];

    /** Plans are captured for queries slower than this many milliseconds. */
    private const PLAN_THRESHOLD = 200.0;

    /** @var list<string> */
    public array $findings = [];

    /** @var array<string, array<string, mixed>> what shape A gave for the parity dataset, by database */
    private array $digests = [];

    private string $output;

    private bool $capturing = false;

    /** The events dispatcher is shared by every connection, so one listener serves them all. */
    private bool $listening = false;

    /** @var list<QueryExecuted> */
    private array $captured = [];

    public function __construct(
        private readonly string $databases,
        private readonly string $volumes,
        private readonly int $repeats,
        private readonly int $parityRows,
        ?string $output,
    ) {
        $this->output = $output ?? '';
    }

    public static function fromEnvironment(): self
    {
        $env = fn (string $name, string $default): string => is_string($value = getenv($name)) && $value !== '' ? $value : $default;

        return new self(
            $env('TRAIL_MEASURE_DATABASES', 'sqlite'),
            $env('TRAIL_MEASURE_ROWS', '100000'),
            (int) $env('TRAIL_MEASURE_REPEATS', '5'),
            (int) $env('TRAIL_MEASURE_PARITY_ROWS', '600'),
            $env('TRAIL_MEASURE_OUT', ''),
        );
    }

    public function run(): void
    {
        foreach (array_filter(array_map('trim', explode(',', $this->databases))) as $driver) {
            $name = $this->connect($driver);
            $db = DB::connection($name);
            assert($db instanceof Connection);

            $this->log("\n## {$driver} ({$db->selectOne($this->versionSql($driver))->version})\n");
            $this->migrate($name);
            $this->parity($db, $driver);

            // SQLite here is a parity check, not a benchmark: an in-memory database with a few thousand rows.
            $volumes = $driver === 'sqlite' ? (is_string($rows = getenv('TRAIL_MEASURE_SQLITE_ROWS')) && $rows !== '' ? $rows : '5000') : $this->volumes;

            foreach (array_filter(array_map('intval', explode(',', $volumes))) as $rows) {
                $this->volume($db, $driver, $rows);
            }
        }

        $this->compareDatabases();

        Carbon::setTestNow();
        CarbonImmutable::setTestNow();

        $this->log("\n## Findings\n\n".($this->findings === [] ? "None: the shapes agreed everywhere they were compared.\n" : '- '.implode("\n- ", $this->findings)."\n"));
    }

    /**
     * The same few hundred rows and the same clock on every database: the shapes must agree with
     * one another, with the existing counts and percentile, and across databases.
     */
    private function parity(Connection $db, string $driver): void
    {
        $now = CarbonImmutable::parse('2026-10-08 12:34:56.000', 'UTC');
        $this->freeze($now);
        $db->table('trail_traces')->truncate();
        OverviewFixture::seed($db, $this->parityRows, $now);

        $digest = [];

        foreach (self::RANGES as $range => $definition) {
            foreach ([null, OverviewFixture::SCOPED_AGENT] as $agent) {
                $label = "parity {$driver} {$range} ".($agent === null ? 'all agents' : 'one agent');
                $results = $this->results($db, $now, $range, $agent);

                if (count($results['A']['buckets']) !== $definition['buckets']) {
                    $this->findings[] = "{$label}: ".count($results['A']['buckets'])." buckets, expected {$definition['buckets']}.";
                }

                $this->agree($label, $results);
                $this->againstExisting($label, $results, $db, $now, $range, $agent);
                $digest["{$range} ".($agent === null ? 'all agents' : 'one agent')] = self::round($results['A']);
            }
        }

        $this->digests[$driver] = $digest;
        $this->log("Parity dataset ({$this->parityRows} rows, fixed clock): shapes A, B and C compared on 1h, 24h and 7d, with and without an agent.\n");
    }

    /**
     * The parity dataset is the same rows and the same clock on every database, so shape A must
     * give the same numbers on all of them.
     */
    private function compareDatabases(): void
    {
        $reference = array_key_first($this->digests);

        foreach ($this->digests as $driver => $digest) {
            if ($driver === $reference) {
                continue;
            }

            $paths = self::flatten($this->digests[$reference]);

            foreach (self::flatten($digest) as $path => $value) {
                if (! array_key_exists($path, $paths) || ! self::same($paths[$path], $value)) {
                    $this->findings[] = "Shape A on the parity dataset differs between {$reference} and {$driver} at {$path}: ".json_encode($paths[$path] ?? null).' against '.json_encode($value);
                }
            }
        }
    }

    /**
     * @param  array<mixed>  $value
     * @return array<string, mixed>
     */
    private static function flatten(array $value, string $prefix = ''): array
    {
        $flat = [];

        foreach ($value as $key => $item) {
            is_array($item) ? $flat += self::flatten($item, "{$prefix}{$key}.") : $flat["{$prefix}{$key}"] = $item;
        }

        return $flat;
    }

    private function volume(Connection $db, string $driver, int $rows): void
    {
        // The parity run froze the clock; read the real one, then freeze it again so that every query of this volume agrees on it.
        Carbon::setTestNow();
        CarbonImmutable::setTestNow();
        $now = CarbonImmutable::now()->setMicroseconds(0);
        $this->freeze($now);

        $db->table('trail_traces')->truncate();
        $start = hrtime(true);
        OverviewFixture::seed($db, $rows, $now);
        $this->analyse($db, $driver);
        $this->log(sprintf("\n### %s, %s rows (seeded in %.1f s; analysed)\n", $driver, number_format($rows), (hrtime(true) - $start) / 1e9));
        $this->log($this->distribution($db));
        $this->log("| candidate | database | rows | range | scope | queries | median ms | per query (median ms) |\n| -- | -- | -- | -- | -- | -- | -- | -- |");

        foreach (array_keys(self::RANGES) as $range) {
            if ($range === '1h') {
                continue;
            }

            foreach ([null, OverviewFixture::SCOPED_AGENT] as $agent) {
                $scope = $agent === null ? 'all agents' : 'one agent (~10%)';
                $this->real($db, $driver, $rows, $range, $scope, $agent, $now);

                if (getenv('TRAIL_MEASURE_SHAPES') === '0') {
                    continue;
                }

                $results = [];
                $shapes = [
                    'A one pass' => fn (OverviewShapes $shapes) => $shapes->onePass(),
                    'B two queries' => fn (OverviewShapes $shapes) => $shapes->twoQueries(),
                    'C one row' => fn (OverviewShapes $shapes) => $shapes->oneRow(),
                    'D p95 count + offset' => fn (OverviewShapes $shapes) => $shapes->percentiles(),
                ];

                foreach ($shapes as $candidate => $run) {
                    $outcome = $this->time($db, $now, $range, $agent, $run);
                    $this->report($candidate, $driver, $rows, $range, $scope, $outcome, $db);
                    $results[$candidate[0]] = $outcome['result'];
                }

                $counts = $results['D']['counts'];
                $outcome = $this->time($db, $now, $range, $agent, fn (OverviewShapes $shapes) => $shapes->percentiles($counts));
                $this->report('D p95 offset only', $driver, $rows, $range, $scope, $outcome, $db);

                $existing = $this->timeExisting($now, $range, $agent);
                $this->log(sprintf('| existing TraceIndex::statusCounts (current period only) | %s | %s | %s | %s | 1 | %.1f | |', $driver, number_format($rows), $range, $scope, $existing));

                $label = "{$driver} {$rows} rows {$range} {$scope}";
                $this->agree($label, ['A' => $results['A'], 'B' => $results['B'], 'C' => $results['C']]);
                $this->againstExisting($label, ['A' => $results['A']], $db, $now, $range, $agent);
            }

            $this->costArithmetic($db, $driver, $rows, $range, $now);
        }

        $this->log('');
    }

    /**
     * @param  callable(OverviewShapes): mixed  $run
     * @return array{median: float, perQuery: array<string, float>, queries: int, result: mixed, last: list<array{label: string, sql: string, bindings: list<mixed>}>}
     */
    private function time(Connection $db, CarbonImmutable $now, string $range, ?string $agent, callable $run): array
    {
        $totals = [];
        $perQuery = [];
        $result = null;
        $last = [];

        for ($repeat = 0; $repeat < $this->repeats; $repeat++) {
            $shapes = $this->shapes($db, $now, $range, $agent);
            $start = hrtime(true);
            $result = $run($shapes);
            $totals[] = (hrtime(true) - $start) / 1e6;

            foreach ($shapes->timings as $label => $values) {
                $perQuery[$label] = [...($perQuery[$label] ?? []), ...$values];
            }

            $last = $shapes->queries;
        }

        return [
            'median' => self::median($totals),
            'perQuery' => array_map(self::median(...), $perQuery),
            'queries' => count($last),
            'result' => $result,
            'last' => $last,
        ];
    }

    /**
     * The overview read the endpoint uses, timed as a whole and query by query, with the plan of
     * any query over the threshold, and checked against the list's own status counts.
     */
    private function real(Connection $db, string $driver, int $rows, string $range, string $scope, ?string $agent, CarbonImmutable $now): void
    {
        if (! $this->listening) {
            $this->listening = true;
            $db->listen(function (QueryExecuted $executed) {
                if ($this->capturing) {
                    $this->captured[] = $executed;
                }
            });
        }

        $timeRange = new TimeRange($range, $now->subSeconds(self::RANGES[$range]['seconds']), $now);
        $query = new OverviewQuery;
        $totals = [];
        $perQuery = [];
        $statements = [];
        $overview = null;

        for ($repeat = 0; $repeat < $this->repeats; $repeat++) {
            $this->captured = [];
            $this->capturing = true;

            $start = hrtime(true);
            $overview = $query->read($timeRange, $agent === null ? RunScope::none() : RunScope::agent($agent));
            $totals[] = (hrtime(true) - $start) / 1e6;

            $this->capturing = false;
            $statements = $this->captured;

            foreach ($statements as $index => $executed) {
                $perQuery['Q'.($index + 1)][] = (float) $executed->time;
            }
        }

        assert($overview !== null);
        $median = array_map(self::median(...), $perQuery);
        $parts = [];

        foreach ($median as $label => $value) {
            $parts[] = sprintf('%s %.1f', $label, $value);
        }

        $this->log(sprintf('| OverviewQuery::read (real) | %s | %s | %s | %s | %d | %.1f | %s |', $driver, number_format($rows), $range, $scope, count($statements), self::median($totals), implode(', ', $parts)));

        foreach ($statements as $index => $executed) {
            $label = 'Q'.($index + 1);

            if ($driver === 'sqlite' || ($median[$label] ?? 0.0) <= self::PLAN_THRESHOLD) {
                continue;
            }

            $this->log("\nPlan for the real read, {$label} ({$driver}, ".number_format($rows)." rows, {$range}, {$scope}), median ".sprintf('%.1f', $median[$label])." ms:\n```");

            try {
                $this->log($this->plan($db, $driver, $executed->sql, $executed->bindings));
            } catch (\Throwable $exception) {
                $this->log('The plan could not be read: '.mb_substr($exception->getMessage(), 0, 200));
            }

            $this->log("```\n");
        }

        $expected = (new TraceIndex)->statusCounts($timeRange, new TraceFilters(agent: $agent), null);

        if ($overview->summary->figures->runs !== $expected) {
            $this->findings[] = "{$driver} {$rows} rows {$range} {$scope}: the real read counts ".json_encode($overview->summary->figures->runs).' but TraceIndex::statusCounts counts '.json_encode($expected).'.';
        }
    }

    private function timeExisting(CarbonImmutable $now, string $range, ?string $agent): float
    {
        $timeRange = new TimeRange($range, $now->subSeconds(self::RANGES[$range]['seconds']), $now);
        $timings = [];

        for ($repeat = 0; $repeat < $this->repeats; $repeat++) {
            $start = hrtime(true);
            (new TraceIndex)->statusCounts($timeRange, new TraceFilters(agent: $agent), null);
            $timings[] = (hrtime(true) - $start) / 1e6;
        }

        return self::median($timings);
    }

    /**
     * @param  array{median: float, perQuery: array<string, float>, queries: int, result: mixed, last: list<array{label: string, sql: string, bindings: list<mixed>}>}  $outcome
     */
    private function report(string $candidate, string $driver, int $rows, string $range, string $scope, array $outcome, Connection $db): void
    {
        $parts = [];

        foreach ($outcome['perQuery'] as $label => $median) {
            $parts[] = sprintf('%s %.1f', $label, $median);
        }

        $this->log(sprintf('| %s | %s | %s | %s | %s | %d | %.1f | %s |', $candidate, $driver, number_format($rows), $range, $scope, $outcome['queries'], $outcome['median'], implode(', ', $parts)));

        foreach ($outcome['last'] as $query) {
            if ($driver === 'sqlite' || ($outcome['perQuery'][$query['label']] ?? 0.0) <= self::PLAN_THRESHOLD) {
                continue;
            }

            $this->log("\nPlan for {$candidate}, query {$query['label']} ({$driver}, ".number_format($rows)." rows, {$range}, {$scope}), median ".sprintf('%.1f', $outcome['perQuery'][$query['label']])." ms:\n```");
            try {
                $this->log($this->plan($db, $driver, $query['sql'], $query['bindings']));
            } catch (\Throwable $exception) {
                $this->log('The plan could not be read: '.mb_substr($exception->getMessage(), 0, 200));
            }

            $this->log("```\n");
        }
    }

    private function plan(Connection $db, string $driver, string $sql, array $bindings): string
    {
        $statement = $db->getQueryGrammar()->substituteBindingsIntoRawSql($sql, $bindings);
        $prefix = $driver === 'pgsql' ? 'explain (analyze, buffers) ' : 'explain analyze ';
        $lines = [];

        foreach ($db->select($prefix.$statement) as $row) {
            foreach (explode("\n", (string) array_values((array) $row)[0]) as $line) {
                $lines[] = mb_strlen($line) > 200 ? mb_substr($line, 0, 200).' ...' : $line;
            }
        }

        $text = implode("\n", $lines);
        preg_match_all('/trail_traces_\w*(?:index|pkey)/', $text, $matches);
        $indexes = array_values(array_unique($matches[0]));

        return implode("\n", array_slice($lines, 0, 40))."\n-- index used: ".($indexes === [] ? 'none (full scan)' : implode(', ', $indexes));
    }

    /**
     * Whether adding the bucket sums in PHP reproduces the database's own total of cost, and what
     * type each driver hands the sums over as.
     */
    private function costArithmetic(Connection $db, string $driver, int $rows, string $range, CarbonImmutable $now): void
    {
        $shapes = $this->shapes($db, $now, $range, null);
        $raw = $shapes->rawCost();
        $values = array_values(array_filter($raw['buckets'], fn ($value) => $value !== null));
        $types = $shapes->aggregateTypes();

        $floatSum = array_sum(array_map(floatval(...), $values));
        $exact = '0';

        foreach ($values as $value) {
            $exact = bcadd($exact, is_string($value) ? $value : sprintf('%.10f', $value), 10);
        }

        $total = is_string($raw['total']) ? bcadd($raw['total'], '0', 10) : sprintf('%.10f', (float) $raw['total']);
        $floatText = sprintf('%.10f', $floatSum);

        $this->log(sprintf(
            'Cost sums, %s, %s rows, %s: sum(cost) arrives as %s; %d bucket sums (%s each); database total %s; PHP float sum %s (difference %s, equal to 10 places: %s); PHP exact sum %s (equal: %s). Other aggregates by PHP type: %s.',
            $driver, number_format($rows), $range, $raw['type'], count($values), get_debug_type($values[0] ?? null),
            $total, $floatText, bcsub($floatText, $total, 10), $floatText === $total ? 'yes' : 'NO', $exact, $exact === $total ? 'yes' : 'NO',
            json_encode($types),
        ));
    }

    /**
     * @return array{A: mixed, B: mixed, C: mixed, D: mixed}
     */
    private function results(Connection $db, CarbonImmutable $now, string $range, ?string $agent): array
    {
        $shapes = fn () => $this->shapes($db, $now, $range, $agent);

        return [
            'A' => $shapes()->onePass(),
            'B' => $shapes()->twoQueries(),
            'C' => $shapes()->oneRow(),
            'D' => $shapes()->percentiles(),
        ];
    }

    /**
     * @param  array<string, mixed>  $results
     */
    private function agree(string $label, array $results): void
    {
        foreach (['B', 'C'] as $other) {
            if (! isset($results['A'], $results[$other])) {
                continue;
            }

            foreach (['previous', 'current'] as $period) {
                foreach ($results['A'][$period] as $name => $value) {
                    if (! self::same($value, $results[$other][$period][$name] ?? null)) {
                        $this->findings[] = "{$label}: A and {$other} differ in {$period} {$name}: ".json_encode($value).' against '.json_encode($results[$other][$period][$name] ?? null);
                    }
                }
            }

            foreach ($results['A']['buckets'] as $index => $bucket) {
                foreach (OverviewShapes::SERIES as $name) {
                    if (! self::same($bucket[$name], $results[$other]['buckets'][$index][$name] ?? null)) {
                        $this->findings[] = "{$label}: A and {$other} differ in bucket {$index} {$name}: ".json_encode($bucket[$name]).' against '.json_encode($results[$other]['buckets'][$index][$name] ?? null);
                    }
                }
            }
        }
    }

    /**
     * The shapes' status counts for the range against what the existing list reads, and the
     * percentile against the existing threshold.
     *
     * @param  array<string, mixed>  $results
     */
    private function againstExisting(string $label, array $results, Connection $db, CarbonImmutable $now, string $range, ?string $agent): void
    {
        $timeRange = new TimeRange($range, $now->subSeconds(self::RANGES[$range]['seconds']), $now);
        $index = new TraceIndex;
        $expected = $index->statusCounts($timeRange, new TraceFilters(agent: $agent), null);

        foreach (['A', 'B', 'C'] as $candidate) {
            if (! isset($results[$candidate])) {
                continue;
            }

            foreach (['completed', 'failed', 'incomplete', 'running', 'awaiting_approval'] as $status) {
                if ($results[$candidate]['current'][$status] !== $expected[$status]) {
                    $this->findings[] = "{$label}: {$candidate} counts {$results[$candidate]['current'][$status]} {$status} runs, TraceIndex::statusCounts counts {$expected[$status]}.";
                }
            }

            if ($results[$candidate]['current']['total'] !== $expected['all']) {
                $this->findings[] = "{$label}: {$candidate} counts {$results[$candidate]['current']['total']} runs, TraceIndex::statusCounts counts {$expected['all']}.";
            }
        }

        if ($agent === null && isset($results['D'])) {
            $threshold = $index->slowThreshold($timeRange);

            if (! self::same($results['D']['current'], $threshold)) {
                $this->findings[] = "{$label}: D gives ".json_encode($results['D']['current']).' for the 95th percentile, TraceIndex::slowThreshold gives '.json_encode($threshold).'.';
            }
        }
    }

    private function shapes(Connection $db, CarbonImmutable $now, string $range, ?string $agent): OverviewShapes
    {
        $definition = self::RANGES[$range];

        return new OverviewShapes($db, $now->subSeconds($definition['seconds']), $now, $definition['unit'], $agent);
    }

    private function freeze(CarbonImmutable $now): void
    {
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);
    }

    private function analyse(Connection $db, string $driver): void
    {
        match ($driver) {
            'mysql' => $db->select('analyze table trail_traces'),
            'pgsql' => $db->statement('analyze trail_traces'),
            default => null,
        };
    }

    private function distribution(Connection $db): string
    {
        $row = $db->selectOne("select count(*) as total, sum(case when name = ? then 1 else 0 end) as scoped, sum(case when status = 'running' then 1 else 0 end) as running, sum(case when status = 'running' and created_at < ? then 1 else 0 end) as stale, sum(case when duration_ms is null then 1 else 0 end) as no_duration from trail_traces", [OverviewFixture::SCOPED_AGENT, StaleRuns::cutoffColumn()]);

        return sprintf('Fixture: %s rows; the scoped agent holds %s (%.1f%%); running %s, of which stale %s; without a duration %s.', number_format((int) $row->total), number_format((int) $row->scoped), 100 * (int) $row->scoped / max(1, (int) $row->total), $row->running, $row->stale, number_format((int) $row->no_duration))."\n";
    }

    private function connect(string $driver): string
    {
        $name = "measure_{$driver}";
        $env = fn (string $key, string $default): string => is_string($value = getenv($key)) && $value !== '' ? $value : $default;

        $connection = match ($driver) {
            'sqlite' => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => ''],
            'mysql' => [
                'driver' => 'mysql', 'host' => $env('TRAIL_MEASURE_HOST', '127.0.0.1'), 'port' => $env('TRAIL_MEASURE_MYSQL_PORT', '33306'),
                'database' => 'trail', 'username' => 'root', 'password' => $env('TRAIL_MEASURE_PASSWORD', 'password'),
                'charset' => 'utf8mb4', 'collation' => 'utf8mb4_unicode_ci', 'prefix' => '', 'strict' => true,
            ],
            'pgsql' => [
                'driver' => 'pgsql', 'host' => $env('TRAIL_MEASURE_HOST', '127.0.0.1'), 'port' => $env('TRAIL_MEASURE_PGSQL_PORT', '35432'),
                'database' => 'trail', 'username' => 'postgres', 'password' => $env('TRAIL_MEASURE_PASSWORD', 'password'),
                'charset' => 'utf8', 'prefix' => '', 'search_path' => 'public', 'sslmode' => 'prefer',
            ],
            default => throw new \InvalidArgumentException("Unknown database {$driver}."),
        };

        config(["database.connections.{$name}" => $connection, 'trail.storage.connection' => $name, 'database.default' => $name]);
        DB::purge($name);

        return $name;
    }

    private function versionSql(string $driver): string
    {
        return match ($driver) {
            'sqlite' => 'select sqlite_version() as version',
            'mysql' => 'select version() as version',
            default => 'select version() as version',
        };
    }

    /**
     * The package's own migrations, dropped first so that a rerun starts clean.
     */
    private function migrate(string $name): void
    {
        $files = glob(dirname(__DIR__, 2).'/database/migrations/*.php') ?: [];
        sort($files);

        foreach (array_reverse($files) as $file) {
            (require $file)->down();
        }

        foreach ($files as $file) {
            (require $file)->up();
        }

        DB::connection($name)->getSchemaBuilder();
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private static function round(array $row): array
    {
        array_walk_recursive($row, function (&$value) {
            if (is_float($value)) {
                $value = round($value, 6);
            }
        });

        return $row;
    }

    private static function same(mixed $left, mixed $right): bool
    {
        if ($left === null || $right === null) {
            return $left === $right;
        }

        return abs((float) $left - (float) $right) <= 1e-9 * max(1.0, abs((float) $left), abs((float) $right));
    }

    /**
     * @param  list<float>  $values
     */
    private static function median(array $values): float
    {
        sort($values);

        return $values[intdiv(count($values), 2)] ?? 0.0;
    }

    private function log(string $line): void
    {
        fwrite(STDERR, $line."\n");

        if ($this->output !== '') {
            file_put_contents($this->output, $line."\n", FILE_APPEND);
        }
    }
}
