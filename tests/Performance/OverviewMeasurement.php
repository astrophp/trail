<?php

namespace Astro\Trail\Tests\Performance;

use Astro\Trail\Enums\IssueKind;
use Astro\Trail\Enums\Status;
use Astro\Trail\Queries\AttentionItem;
use Astro\Trail\Queries\AttentionQuery;
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
 * Times the reads of the dashboard's endpoints on the databases the package supports, query by
 * query, and checks their numbers against the list's own. Driven by environment variables; see
 * OverviewQueriesTest. A new endpoint adds its read to measure() beside the overview's.
 */
final class OverviewMeasurement
{
    /** @var array<string, int> range => seconds */
    private const RANGES = ['24h' => 86400, '7d' => 604800];

    /** Plans are captured for queries slower than this many milliseconds. */
    private const PLAN_THRESHOLD = 200.0;

    /** @var list<string> */
    public array $findings = [];

    private bool $capturing = false;

    /** @var list<QueryExecuted> */
    private array $captured = [];

    /** The events dispatcher is shared by every connection, so one listener serves them all. */
    private bool $listening = false;

    public function __construct(
        private readonly string $databases,
        private readonly string $volumes,
        private readonly int $repeats,
        private readonly string $output,
    ) {}

    public static function fromEnvironment(): self
    {
        $env = fn (string $name, string $default): string => is_string($value = getenv($name)) && $value !== '' ? $value : $default;

        return new self(
            $env('TRAIL_MEASURE_DATABASES', 'sqlite'),
            $env('TRAIL_MEASURE_ROWS', '100000'),
            (int) $env('TRAIL_MEASURE_REPEATS', '5'),
            $env('TRAIL_MEASURE_OUT', ''),
        );
    }

    public function run(): void
    {
        foreach (array_filter(array_map('trim', explode(',', $this->databases))) as $driver) {
            $name = $this->connect($driver);
            $db = DB::connection($name);
            assert($db instanceof Connection);

            $this->log("\n## {$driver} ({$db->selectOne('select '.($driver === 'sqlite' ? 'sqlite_version()' : 'version()').' as version')->version})\n");
            $this->migrate($name);

            // SQLite is only a sanity check here: an in-memory database with a few thousand rows.
            $volumes = $driver === 'sqlite' ? (is_string($rows = getenv('TRAIL_MEASURE_SQLITE_ROWS')) && $rows !== '' ? $rows : '5000') : $this->volumes;

            foreach (array_filter(array_map('intval', explode(',', $volumes))) as $rows) {
                $this->volume($db, $driver, $rows);
            }
        }

        Carbon::setTestNow();
        CarbonImmutable::setTestNow();

        $this->log("\n## Findings\n\n".($this->findings === [] ? "None: every read agreed with the list's counts.\n" : '- '.implode("\n- ", $this->findings)."\n"));
    }

    private function volume(Connection $db, string $driver, int $rows): void
    {
        // The clock is frozen so that every query of the volume agrees on it, the stale cutoff included.
        $now = CarbonImmutable::now()->setMicroseconds(0);
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);

        $db->table('trail_traces')->truncate();
        $start = hrtime(true);
        OverviewFixture::seed($db, $rows, $now);
        $this->analyse($db, $driver);
        $this->log(sprintf("\n### %s, %s rows (seeded in %.1f s; analysed)\n", $driver, number_format($rows), (hrtime(true) - $start) / 1e9));
        $this->log($this->distribution($db));
        $this->log("| read | database | rows | range | scope | queries | median ms | per query (median ms) | found |\n| -- | -- | -- | -- | -- | -- | -- | -- | -- |");

        foreach (array_keys(self::RANGES) as $range) {
            foreach ([null, OverviewFixture::SCOPED_AGENT] as $agent) {
                $window = new TimeRange($range, $now->subSeconds(self::RANGES[$range]), $now);
                $this->measure($db, $driver, $rows, $window, $agent);
                $this->measureAttention($db, $driver, $rows, $window, $agent);
            }
        }

        $this->log('');
    }

    /**
     * The overview read, timed as a whole and query by query, with the plan of any query over the
     * threshold, and its status counts checked against the list's.
     */
    private function measure(Connection $db, string $driver, int $rows, TimeRange $range, ?string $agent): void
    {
        $scope = $agent === null ? 'all agents' : 'one agent (~10%)';
        $label = "{$driver} {$rows} rows {$range->preset} {$scope}";

        $this->listen($db);

        $totals = [];
        $perQuery = [];
        $statements = [];
        $overview = null;

        for ($repeat = 0; $repeat < $this->repeats; $repeat++) {
            $this->captured = [];
            $this->capturing = true;

            $start = hrtime(true);
            $overview = (new OverviewQuery)->read($range, $agent === null ? RunScope::none() : RunScope::agent($agent));
            $totals[] = (hrtime(true) - $start) / 1e6;

            $this->capturing = false;
            $statements = $this->captured;

            foreach ($statements as $index => $executed) {
                $perQuery['Q'.($index + 1)][] = (float) $executed->time;
            }
        }

        assert($overview !== null);
        $median = array_map(self::median(...), $perQuery);
        $split = implode(', ', array_map(fn (string $query, float $ms) => sprintf('%s %.1f', $query, $ms), array_keys($median), $median));

        $this->log(sprintf('| OverviewQuery::read | %s | %s | %s | %s | %d | %.1f | %s | |', $driver, number_format($rows), $range->preset, $scope, count($statements), self::median($totals), $split));

        foreach ($statements as $index => $executed) {
            $query = 'Q'.($index + 1);

            if ($driver !== 'sqlite' && ($median[$query] ?? 0.0) > self::PLAN_THRESHOLD) {
                $this->log("\nPlan for {$query} of {$label}, median ".sprintf('%.1f', $median[$query])." ms:\n```");
                $this->log($this->plan($db, $driver, $executed->sql, $executed->bindings));
                $this->log("```\n");
            }
        }

        $expected = (new TraceIndex)->statusCounts($range, new TraceFilters(agent: $agent), null);

        if ($overview->summary->figures->runs !== $expected) {
            $this->findings[] = "{$label}: the overview counts ".json_encode($overview->summary->figures->runs).' but TraceIndex::statusCounts counts '.json_encode($expected).'.';
        }
    }

    /**
     * The needs-attention read, timed as a whole and query by query, with the plan of a query over
     * the threshold. Every item and every breakdown row is checked against the count the list's
     * own query gives for the item's filters.
     */
    private function measureAttention(Connection $db, string $driver, int $rows, TimeRange $range, ?string $agent): void
    {
        $scope = $agent === null ? 'all agents' : 'one agent (~10%)';
        $label = "{$driver} {$rows} rows {$range->preset} {$scope}";

        $this->listen($db);

        $totals = [];
        $perQuery = [];
        $statements = [];
        $items = [];

        for ($repeat = 0; $repeat < $this->repeats; $repeat++) {
            $this->captured = [];
            $this->capturing = true;

            $start = hrtime(true);
            $items = (new AttentionQuery)->read($range, $agent === null ? RunScope::none() : RunScope::agent($agent));
            $totals[] = (hrtime(true) - $start) / 1e6;

            $this->capturing = false;
            $statements = $this->captured;

            foreach ($statements as $index => $executed) {
                $perQuery['Q'.($index + 1)][] = (float) $executed->time;
            }
        }

        $median = array_map(self::median(...), $perQuery);
        $split = implode(', ', array_map(fn (string $query, float $ms) => sprintf('%s %.1f', $query, $ms), array_keys($median), $median));
        $found = implode(', ', array_map(fn (AttentionItem $item) => $item->kind->value.' '.$item->count, $items));

        $this->log(sprintf('| AttentionQuery::read | %s | %s | %s | %s | %d | %.1f | %s | %s |', $driver, number_format($rows), $range->preset, $scope, count($statements), self::median($totals), $split, $found));

        foreach ($statements as $index => $executed) {
            $query = 'Q'.($index + 1);

            if ($driver !== 'sqlite' && ($median[$query] ?? 0.0) > self::PLAN_THRESHOLD) {
                $this->log("\nPlan for {$query} of the attention read, {$label}, median ".sprintf('%.1f', $median[$query])." ms:\n```");
                $this->log($this->plan($db, $driver, $executed->sql, $executed->bindings));
                $this->log("```\n");
            }
        }

        $list = new TraceIndex;

        foreach ($items as $item) {
            $counted = [[$item->kind->value, $item->filters, $item->count]];

            foreach ($item->breakdown as $row) {
                $counted[] = ["{$item->kind->value}/{$row->issueKind->value}", $row->filters, $row->count];
            }

            foreach ($counted as [$name, $filters, $count]) {
                $listed = $list->count($range, self::filtersOf($filters, $agent), null);

                if ($listed !== $count) {
                    $this->findings[] = "{$label}: the attention item {$name} counts {$count} but the list counts {$listed} for ".json_encode($filters).'.';
                }
            }
        }
    }

    /**
     * The list's filters for the parameters of an item.
     *
     * @param  array<string, string>  $parameters
     */
    private static function filtersOf(array $parameters, ?string $agent): TraceFilters
    {
        return new TraceFilters(
            status: isset($parameters['status']) ? Status::from($parameters['status']) : null,
            agent: $agent,
            issueKind: isset($parameters['issue_kind']) ? IssueKind::from($parameters['issue_kind']) : null,
            recovered: ($parameters['recovered'] ?? '0') === '1',
            childFailed: ($parameters['child_failed'] ?? '0') === '1',
            unpriced: ($parameters['unpriced'] ?? '0') === '1',
        );
    }

    private function listen(Connection $db): void
    {
        if ($this->listening) {
            return;
        }

        $this->listening = true;
        $db->listen(function (QueryExecuted $executed) {
            if ($this->capturing) {
                $this->captured[] = $executed;
            }
        });
    }

    /**
     * @param  list<mixed>  $bindings
     */
    private function plan(Connection $db, string $driver, string $sql, array $bindings): string
    {
        try {
            $statement = $db->getQueryGrammar()->substituteBindingsIntoRawSql($sql, $bindings);
            $lines = [];

            foreach ($db->select(($driver === 'pgsql' ? 'explain (analyze, buffers) ' : 'explain analyze ').$statement) as $row) {
                foreach (explode("\n", (string) array_values((array) $row)[0]) as $line) {
                    $lines[] = mb_strlen($line) > 200 ? mb_substr($line, 0, 200).' ...' : $line;
                }
            }
        } catch (\Throwable $exception) {
            return 'The plan could not be read: '.mb_substr($exception->getMessage(), 0, 200);
        }

        preg_match_all('/trail_traces_\w*(?:index|pkey)/', implode("\n", $lines), $matches);
        $indexes = array_values(array_unique($matches[0]));

        return implode("\n", array_slice($lines, 0, 40))."\n-- index used: ".($indexes === [] ? 'none (full scan)' : implode(', ', $indexes));
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
