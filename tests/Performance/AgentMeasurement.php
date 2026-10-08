<?php

namespace Astro\Trail\Tests\Performance;

use Astro\Trail\Queries\AttentionQuery;
use Astro\Trail\Queries\BucketUnit;
use Astro\Trail\Queries\OverviewQuery;
use Astro\Trail\Queries\RunScope;
use Astro\Trail\Queries\TimeRange;
use Carbon\CarbonImmutable;
use Closure;
use Illuminate\Database\Connection;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Times the reads behind an agents list and an agent's page on the databases the package supports,
 * with and without indexes made by hand in the throwaway database, and checks that they agree. Driven
 * by environment variables; see AgentQueriesTest.
 */
final class AgentMeasurement
{
    /** The agent that holds about a third of the runs. */
    public const BIG_AGENT = 'SupportAssistant';

    /** @var array<string, int> range => seconds */
    private const RANGES = ['24h' => 86400, '7d' => 604800];

    /** Plans are captured for queries slower than this many milliseconds. */
    private const PLAN_THRESHOLD = 200.0;

    /** Span rows inserted for the write-cost measurement, and the rows of one insert. */
    private const INSERT_ROWS = 50000;

    private const INSERT_CHUNK = 500;

    private const INSERT_ROUNDS = 3;

    /** @var array<string, array{0: string, 1: string}> the indexes tried by hand: name => table and columns */
    private const INDEXES = [
        'traces_name' => ['trail_traces', 'name, started_at'],
        'spans_type_name' => ['trail_spans', 'type, name, started_at'],
        'spans_parent' => ['trail_spans', 'parent_id'],
        'spans_trace_type' => ['trail_spans', 'trace_id, type, name'],
    ];

    /** @var list<string> */
    public array $findings = [];

    private ReadTimer $timer;

    public function __construct(
        private readonly string $databases,
        private readonly string $volumes,
        private readonly int $repeats,
        private readonly string $output,
        private readonly string $configs,
        private readonly string $only,
        private readonly int $checkMax,
    ) {
        $this->timer = new ReadTimer($repeats);
    }

    public static function fromEnvironment(): self
    {
        $env = fn (string $name, string $default): string => is_string($value = getenv($name)) && $value !== '' ? $value : $default;

        return new self(
            $env('TRAIL_MEASURE_DATABASES', 'sqlite'),
            $env('TRAIL_MEASURE_ROWS', '100000'),
            (int) $env('TRAIL_MEASURE_REPEATS', '5'),
            $env('TRAIL_MEASURE_OUT', ''),
            $env('TRAIL_MEASURE_CONFIGS', 'baseline,traces_name,spans_type_name,spans_parent,spans_trace_type,all'),
            $env('TRAIL_MEASURE_ONLY', ''),
            (int) $env('TRAIL_MEASURE_CHECK_MAX', '150000'),
        );
    }

    public function run(): void
    {
        foreach (array_filter(array_map('trim', explode(',', $this->databases))) as $driver) {
            $name = MeasureDatabase::connect($driver);
            $db = DB::connection($name);
            assert($db instanceof Connection);

            $this->log("\n## {$driver} ({$db->selectOne('select '.($driver === 'sqlite' ? 'sqlite_version()' : 'version()').' as version')->version})\n");
            $this->log('uptime before: '.trim((string) shell_exec('uptime')));
            MeasureDatabase::migrate($name);
            MeasureDatabase::limit($db, $driver);
            $this->collation($db, $driver);

            // SQLite is only a sanity check here: an in-memory database with a few hundred runs.
            $volumes = $driver === 'sqlite' ? (is_string($rows = getenv('TRAIL_MEASURE_SQLITE_ROWS')) && $rows !== '' ? $rows : '300') : $this->volumes;

            foreach (array_filter(array_map('intval', explode(',', $volumes))) as $rows) {
                $this->volume($db, $driver, $rows);
            }

            $this->log('uptime after: '.trim((string) shell_exec('uptime')));
        }

        Carbon::setTestNow();
        CarbonImmutable::setTestNow();

        $this->log("\n## Findings\n\n".($this->findings === [] ? "None: every check agreed.\n" : '- '.implode("\n- ", $this->findings)."\n"));
    }

    private function volume(Connection $db, string $driver, int $rows): void
    {
        // The clock is frozen so that every query of the volume agrees on it, the stale cutoff included.
        $now = CarbonImmutable::now()->setMicroseconds(0);
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);

        $db->table('trail_spans')->truncate();
        $db->table('trail_traces')->truncate();

        $start = hrtime(true);
        OverviewFixture::seed($db, $rows, $now, spans: true);
        $seeded = (hrtime(true) - $start) / 1e9;
        MeasureDatabase::analyse($db, $driver);

        $spans = (int) $db->table('trail_spans')->count();
        $this->log(sprintf("\n### %s, %s runs, %s spans (%.1f per run; seeded in %.0f s; analysed)\n", $driver, number_format($rows), number_format($spans), $spans / max(1, $rows), $seeded));
        $this->log($this->distribution($db));
        $this->log($this->sizes('sizes at baseline', MeasureDatabase::sizes($db, $driver)));

        $ranges = [];

        foreach (self::RANGES as $preset => $seconds) {
            $ranges[$preset] = new TimeRange($preset, $now->subSeconds($seconds), $now);
        }

        $reads = new AgentReads($db);

        if ($driver === 'sqlite' || $rows <= $this->checkMax) {
            foreach ($ranges as $preset => $range) {
                array_push($this->findings, ...(new AgentChecks($db, $reads))->run($range, "{$driver} {$rows} runs {$preset}"));
            }

            $this->log('Checks run on this dataset: '.($this->findings === [] ? 'every one agreed.' : count($this->findings).' finding(s), listed at the end.')."\n");
        }

        $this->log("| read | database | runs | range | indexes | queries | n | median ms | per query (median ms) | found |\n| -- | -- | -- | -- | -- | -- | -- | -- | -- | -- |");

        $context = $this->context($reads, $ranges);

        foreach (array_filter(array_map('trim', explode(',', $this->configs))) as $config) {
            $names = $this->indexNames($config);
            $built = $this->build($db, $driver, $names);

            foreach ($this->definitions($reads, $context) as [$label, $touchesSpans, $read]) {
                if (($this->only !== '' && preg_match('/'.$this->only.'/', $label) !== 1) || ($config !== 'baseline' && ! $touchesSpans && ! array_filter($names, fn (string $name) => self::INDEXES[$name][0] === 'trail_traces'))) {
                    continue;
                }

                foreach ($ranges as $range) {
                    $this->measure($db, $driver, $rows, $range, $config, $label, fn () => $read($range));
                }
            }

            $this->log("\n(indexes \"{$config}\": ".implode('; ', $built).")\n");
            $this->drop($db, $driver, $names);
        }

        if ($driver !== 'sqlite') {
            $this->writes($db, $driver, $now, $rows);
        }
    }

    /**
     * The names of the page and the runs with a duration of each agent, per range: what two of the
     * reads are given, worked out once and outside the timing.
     *
     * @param  array<string, TimeRange>  $ranges
     * @return array<string, array{names: list<string>, measured: array<string, int>, cuts: list<array<string, mixed>>}>
     */
    private function context(AgentReads $reads, array $ranges): array
    {
        $context = [];

        foreach ($ranges as $preset => $range) {
            $top = $reads->topLevel($range);
            usort($top, fn (array $a, array $b) => (int) $b['runs'] <=> (int) $a['runs']);
            $measured = [];

            foreach ($top as $row) {
                $measured[(string) $row['name']] = (int) $row['measured'];
            }

            $context[$preset] = [
                'names' => array_map(fn (array $row) => (string) $row['name'], array_slice($top, 0, AgentReads::PAGE)),
                'measured' => array_slice($measured, 0, AgentReads::PAGE, true),
                'cuts' => BucketUnit::for($range)->buckets($range),
            ];
        }

        return $context;
    }

    /**
     * Every read to time: its label, whether it reads spans, and the read for a range.
     *
     * @param  array<string, array{names: list<string>, measured: array<string, int>, cuts: list<array<string, mixed>>}>  $context
     * @return list<array{0: string, 1: bool, 2: Closure(TimeRange): mixed}>
     */
    private function definitions(AgentReads $reads, array $context): array
    {
        $big = self::BIG_AGENT;
        $tenth = OverviewFixture::SCOPED_AGENT;
        $common = (string) array_key_first(SpanFixture::TOOLS);
        $rare = (string) array_key_last(SpanFixture::TOOLS);
        $page = fn (TimeRange $range): array => $context[(string) $range->preset];

        return [
            ['A agents, all', false, fn (TimeRange $r) => $reads->topLevel($r)],
            ['A page by runs', false, fn (TimeRange $r) => $reads->topLevelPage($r, 'runs')],
            ['A page by cost', false, fn (TimeRange $r) => $reads->topLevelPage($r, 'cost')],
            ['B delegated, in', true, fn (TimeRange $r) => $reads->delegated($r, 'in')],
            ['B delegated, join', true, fn (TimeRange $r) => $reads->delegated($r, 'join')],
            ['B delegated, in + own start', true, fn (TimeRange $r) => $reads->delegated($r, 'bounded')],
            ['C union all, page by runs', true, fn (TimeRange $r) => $reads->combinedPage($r, 'runs')],
            ['C union all, page by cost', true, fn (TimeRange $r) => $reads->combinedPage($r, 'cost')],
            ['C A and B apart, merged in PHP', true, fn (TimeRange $r) => $reads->merged($r)],
            ['D(i) p95 window, all agents', false, fn (TimeRange $r) => $reads->p95Window($r, null)],
            ['D(i) p95 window, page', false, fn (TimeRange $r) => $reads->p95Window($r, $page($r)['names'])],
            ['D(ii) p95 offsets, page', false, fn (TimeRange $r) => $reads->p95Offsets($r, $page($r)['measured'])],
            ['E series, page', false, fn (TimeRange $r) => $reads->series($r, $page($r)['names'], $page($r)['cuts'])],
            ['F models, 35% agent', true, fn (TimeRange $r) => $reads->modelsOf($big, $r)],
            ['F models, 10% agent', true, fn (TimeRange $r) => $reads->modelsOf($tenth, $r)],
            ['G tools, 35% agent', true, fn (TimeRange $r) => $reads->toolsOf($big, $r)],
            ['G tools, 10% agent', true, fn (TimeRange $r) => $reads->toolsOf($tenth, $r)],
            ['H models and tools, sub-agent only', true, fn (TimeRange $r) => $reads->delegatedUse(SpanFixture::DELEGATED_ONLY, $r)],
            ['I runs calling the most common tool', true, fn (TimeRange $r) => $reads->calling($common, $r)],
            ['I runs calling the rarest tool', true, fn (TimeRange $r) => $reads->calling($rare, $r)],
            ['J overview, 35% agent', false, fn (TimeRange $r) => (new OverviewQuery)->read($r, RunScope::agent($big))],
            ['J overview, 10% agent', false, fn (TimeRange $r) => (new OverviewQuery)->read($r, RunScope::agent($tenth))],
            ['J attention, 35% agent', false, fn (TimeRange $r) => (new AttentionQuery)->read($r, RunScope::agent($big))],
            ['J attention, 10% agent', false, fn (TimeRange $r) => (new AttentionQuery)->read($r, RunScope::agent($tenth))],
        ];
    }

    private function measure(Connection $db, string $driver, int $rows, TimeRange $range, string $config, string $label, Closure $read): void
    {
        $timing = $this->timer->time($db, $read);

        if ($timing['error'] !== null) {
            $this->log(sprintf('| %s | %s | %s | %s | %s | | %d | FAILED | | %s |', $label, $driver, number_format($rows), $range->preset, $config, $timing['repeats'], $timing['error']));

            return;
        }

        $split = implode(', ', array_map(fn (int $index, float $ms) => sprintf('Q%d %.1f', $index + 1, $ms), array_keys($timing['per_query']), $timing['per_query']));
        $this->log(sprintf('| %s | %s | %s | %s | %s | %d | %d | %.1f | %s | %s |', $label, $driver, number_format($rows), $range->preset, $config, count($timing['statements']), $timing['repeats'], $timing['median'], mb_substr($split, 0, 120), self::found($timing['result'])));

        foreach ($timing['statements'] as $index => $executed) {
            if ($driver !== 'sqlite' && ($timing['per_query'][$index] ?? 0.0) > self::PLAN_THRESHOLD) {
                $this->log(sprintf("\nPlan for Q%d of \"%s\", %s, %s runs, indexes \"%s\", median %.1f ms:\n```", $index + 1, $label, $range->preset, number_format($rows), $config, $timing['per_query'][$index]));
                $this->log(MeasureDatabase::plan($db, $driver, $executed->sql, $executed->bindings));
                $this->log("```\n");
            }
        }
    }

    private static function found(mixed $result): string
    {
        if (! is_array($result)) {
            return '';
        }

        return isset($result['rows']) && is_array($result['rows']) ? count($result['rows']).' rows' : count($result).' rows';
    }

    // Indexes made by hand --------------------------------------------------------------------------------

    /**
     * @return list<string> the keys of INDEXES a configuration holds: "baseline" none, "all" every one, else names joined by "+"
     */
    private function indexNames(string $config): array
    {
        return match ($config) {
            'baseline' => [],
            'all' => array_keys(self::INDEXES),
            default => array_map(fn (string $name) => isset(self::INDEXES[$name]) ? $name : throw new \InvalidArgumentException("Unknown index {$name}."), explode('+', $config)),
        };
    }

    /**
     * @param  list<string>  $names
     * @return list<string> what each index took to build and weighs
     */
    private function build(Connection $db, string $driver, array $names): array
    {
        $built = [];

        foreach ($names as $name) {
            [$table, $columns] = self::INDEXES[$name];
            $start = hrtime(true);
            $db->statement("create index hyp_{$name} on {$table} ({$columns})");
            $seconds = (hrtime(true) - $start) / 1e9;
            MeasureDatabase::analyse($db, $driver);

            $size = MeasureDatabase::sizes($db, $driver)["{$table}.hyp_{$name}"] ?? null;
            $built[] = sprintf('hyp_%s on %s (%s) built in %.1f s, %s', $name, $table, $columns, $seconds, $size === null ? 'size not read' : sprintf('%.1f MiB', $size / 1048576));
        }

        return $built;
    }

    /**
     * @param  list<string>  $names
     */
    private function drop(Connection $db, string $driver, array $names): void
    {
        foreach ($names as $name) {
            $db->statement($driver === 'mysql' ? 'drop index hyp_'.$name.' on '.self::INDEXES[$name][0] : "drop index hyp_{$name}");
        }

        if ($names !== []) {
            MeasureDatabase::analyse($db, $driver);
        }
    }

    // The cost of an index on writes ----------------------------------------------------------------------

    /**
     * Bulk inserts of span rows into the full table with each span index alone and all together, as
     * rows per second, in rounds that alternate the configurations. The rows are taken out again.
     */
    private function writes(Connection $db, string $driver, CarbonImmutable $now, int $rows): void
    {
        $spanIndexes = array_keys(array_filter(self::INDEXES, fn (array $index) => $index[0] === 'trail_spans'));
        $configs = [[], ...array_map(fn (string $name) => [$name], $spanIndexes), $spanIndexes];
        $batch = $this->spanRows($now);
        $rates = [];

        for ($round = 0; $round < self::INSERT_ROUNDS; $round++) {
            foreach ($configs as $names) {
                $this->build($db, $driver, $names);
                $start = hrtime(true);

                foreach (array_chunk($batch, self::INSERT_CHUNK) as $chunk) {
                    $db->table('trail_spans')->insert($chunk);
                }

                $rates[implode('+', $names) ?: 'none'][] = count($batch) / ((hrtime(true) - $start) / 1e9);
                $db->table('trail_spans')->where('trace_id', 'like', 'ffffffff-bench-%')->delete();
                $this->drop($db, $driver, $names);
            }
        }

        $this->log(sprintf("\nInsert throughput into %s runs of spans (%s rows in inserts of %d, median of %d rounds):\n\n| span indexes | rows per second | relative to none |\n| -- | -- | -- |", number_format($rows), number_format(self::INSERT_ROWS), self::INSERT_CHUNK, self::INSERT_ROUNDS));
        $none = ReadTimer::median($rates['none'] ?? []);

        foreach ($rates as $label => $values) {
            $this->log(sprintf('| %s | %s | %.0f%% |', $label, number_format(ReadTimer::median($values)), 100 * ReadTimer::median($values) / max(1.0, $none)));
        }

        $this->log('');
    }

    /**
     * Span rows for runs that start after every seeded one, so that they land where new spans do.
     *
     * @return list<array<string, mixed>>
     */
    private function spanRows(CarbonImmutable $now): array
    {
        $fixture = new SpanFixture(77);
        $spans = [];
        $startedAt = $now->getTimestampMs() + 1000;

        for ($run = 0; count($spans) < self::INSERT_ROWS; $run++) {
            array_push($spans, ...$fixture->forRun(['id' => sprintf('ffffffff-bench-%08d', $run), 'name' => 'BenchAgent', 'status' => 'completed', 'duration_ms' => 1500.0], $startedAt + $run * 10));
        }

        return array_slice($spans, 0, self::INSERT_ROWS);
    }

    // Text comparison -------------------------------------------------------------------------------------

    /**
     * How the database groups and matches names that differ in case and accent, on runs and on the
     * sub-agent spans: the fact behind an agent row counting what the list counts for its name.
     */
    private function collation(Connection $db, string $driver): void
    {
        $stamp = fn (int $minute): string => '2026-01-01 12:'.sprintf('%02d', $minute).':00.000';
        $trace = fn (string $id, string $name, int $minute): array => ['id' => $id, 'type' => 'agent', 'name' => $name, 'status' => 'completed', 'started_at' => $stamp($minute), 'created_at' => $stamp($minute), 'updated_at' => $stamp($minute)];
        $span = fn (string $id, string $name, int $minute): array => ['id' => $id, 'trace_id' => 'run-1', 'parent_id' => 'tool-1', 'type' => 'agent', 'name' => $name, 'status' => 'completed', 'started_at' => $stamp($minute), 'created_at' => $stamp($minute), 'updated_at' => $stamp($minute)];

        // Runs: Support, support (the latest). Sub-agents: SUPPORT, Suppört.
        $db->table('trail_traces')->insert([$trace('run-1', 'Support', 1), $trace('run-2', 'support', 2), $trace('run-3', 'SUPPORT', 3), $trace('run-4', 'Suppört', 4)]);
        $db->table('trail_spans')->insert([$span('span-1', 'SUPPORT', 5), $span('span-2', 'Suppört', 6)]);

        $names = fn (string $sql): string => implode(', ', array_map(fn (object $row) => implode('=', array_values((array) $row)), $db->select($sql)));
        $count = fn (string $name): string => (string) $db->selectOne('select (select count(*) from trail_traces where name = ?) as runs, (select count(*) from trail_spans where type = \'agent\' and name = ?) as spans', [$name, $name])->runs;

        $this->log("Text comparison on {$driver}, runs Support, support, SUPPORT, Suppört and sub-agent spans SUPPORT, Suppört:\n");
        $this->log('- group by name over the runs: '.$names('select name, count(*) as runs from trail_traces group by name order by min(started_at)'));
        $this->log('- spelling of the latest run in each group (row_number over partition by name): '.$names('select name, place from (select name, row_number() over (partition by name order by started_at desc) as place from trail_traces) t where place = 1 order by name'));
        $this->log('- where name = ... matches runs: '.implode(', ', array_map(fn (string $name) => "{$name} {$count($name)}", ['support', 'Support', 'SUPPORT', 'Suppört', 'suppört'])));
        $this->log('- union all of the runs and the sub-agents, grouped by name outside: '.$names('select name, sum(runs) as runs, sum(delegated) as delegated from (select name, count(*) as runs, 0 as delegated from trail_traces group by name union all select name, 0 as runs, count(*) as delegated from trail_spans where type = \'agent\' and parent_id is not null group by name) u group by name order by min(name)')."\n");

        $db->table('trail_spans')->truncate();
        $db->table('trail_traces')->truncate();
    }

    // Reporting -------------------------------------------------------------------------------------------

    /**
     * @param  array<string, int>  $sizes
     */
    private function sizes(string $title, array $sizes): string
    {
        if ($sizes === []) {
            return '';
        }

        return "\n{$title}: ".implode(', ', array_map(fn (string $name, int $bytes) => sprintf('%s %.1f MiB', $name, $bytes / 1048576), array_keys($sizes), $sizes))."\n";
    }

    private function distribution(Connection $db): string
    {
        $row = $db->selectOne("select (select count(*) from trail_traces where name = ?) as big, (select count(*) from trail_traces where name = ?) as tenth, (select count(*) from trail_traces) as runs, (select count(*) from trail_spans where type = 'agent' and parent_id is not null) as delegated, (select count(*) from trail_spans where type = 'tool') as tools, (select count(*) from trail_spans where type = 'step') as steps", [self::BIG_AGENT, OverviewFixture::SCOPED_AGENT]);

        return sprintf('Fixture: %s runs, the 35%% agent holds %s and the 10%% agent %s; %s steps, %s tool calls, %s delegated agent spans.', number_format((int) $row->runs), number_format((int) $row->big), number_format((int) $row->tenth), number_format((int) $row->steps), number_format((int) $row->tools), number_format((int) $row->delegated))."\n";
    }

    private function log(string $line): void
    {
        fwrite(STDERR, $line."\n");

        if ($this->output !== '') {
            file_put_contents($this->output, $line."\n", FILE_APPEND);
        }
    }
}
