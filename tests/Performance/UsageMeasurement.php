<?php

namespace Astro\Trail\Tests\Performance;

use Astro\Trail\Queries\AgentBreakdown;
use Astro\Trail\Queries\BucketUnit;
use Astro\Trail\Queries\TimeRange;
use Astro\Trail\Storage\StaleRuns;
use Carbon\CarbonImmutable;
use Closure;
use Illuminate\Database\Connection;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Times the reads a usage page would need, on spans as they are and on a per-run summary made by
 * hand in the throwaway database, checks that the two agree, and times what keeping the summary
 * current would add to a flush. Driven by environment variables; see UsageQueriesTest.
 */
final class UsageMeasurement
{
    /** @var array<string, int> range => seconds */
    private const RANGES = ['24h' => 86400, '7d' => 604800];

    /** Plans are captured for queries slower than this many milliseconds. */
    private const PLAN_THRESHOLD = 200.0;

    /** The summaries' tables, in the order they are built. */
    private const TABLES = ['trail_trace_models', 'trail_trace_tools'];

    /**
     * The indexes tried by hand: name => table => columns.
     *
     * @var array<string, array<string, string>>
     */
    private const INDEXES = [
        'started' => ['trail_trace_models' => 'started_at', 'trail_trace_tools' => 'started_at'],
        'pms' => ['trail_trace_models' => 'provider, model, started_at', 'trail_trace_tools' => 'name, started_at'],
        'trace' => ['trail_trace_models' => 'trace_id', 'trail_trace_tools' => 'trace_id'],
        'name' => ['trail_trace_models' => 'name, started_at', 'trail_trace_tools' => 'run_name, started_at'],
    ];

    /** @var list<string> */
    public array $findings = [];

    /** @var array<string, list<array<string, mixed>>> what the span reads returned, by range and label */
    private array $expected = [];

    private ReadTimer $timer;

    public function __construct(
        private readonly string $databases,
        private readonly string $volumes,
        private readonly int $repeats,
        private readonly string $output,
        private readonly string $configs,
        private readonly string $only,
        private readonly int $checkMax,
        private readonly int $writeRuns,
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
            $env('TRAIL_MEASURE_CONFIGS', 'none,started,pms,trace,name,all'),
            $env('TRAIL_MEASURE_ONLY', ''),
            (int) $env('TRAIL_MEASURE_CHECK_MAX', '150000'),
            (int) $env('TRAIL_MEASURE_WRITE_RUNS', '300'),
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
        $this->expected = [];

        $schema = $db->getSchemaBuilder();
        $schema->dropIfExists('trail_trace_models');
        $schema->dropIfExists('trail_trace_tools');
        $db->table('trail_spans')->truncate();
        $db->table('trail_traces')->truncate();

        $start = hrtime(true);
        OverviewFixture::seed($db, $rows, $now, spans: true);
        $seeded = (hrtime(true) - $start) / 1e9;

        // The fixture's agent spans carry no model; some delegated ones do, as a recorded agent span can.
        $carrying = $db->table('trail_spans')->where('type', 'agent')->where('name', SpanFixture::DELEGATED_ONLY)->update(['provider' => 'openai', 'model' => 'gpt-agent-only'])
            + $db->table('trail_spans')->where('type', 'agent')->where('name', 'FactChecker')->update(['provider' => 'anthropic', 'model' => 'claude-sonnet-4-5']);
        MeasureDatabase::analyse($db, $driver);

        $spans = (int) $db->table('trail_spans')->count();
        $this->log(sprintf("\n### %s, %s runs, %s spans (%.1f per run; seeded in %.0f s; %s delegated agent spans given a model; analysed)\n", $driver, number_format($rows), number_format($spans), $spans / max(1, $rows), $seeded, number_format($carrying)));
        $this->log($this->sizes('sizes at baseline', MeasureDatabase::sizes($db, $driver)));

        $ranges = [];

        foreach (self::RANGES as $preset => $seconds) {
            $ranges[$preset] = new TimeRange($preset, $now->subSeconds($seconds), $now);
        }

        $reads = new UsageReads($db);
        $context = $this->context($ranges);

        $this->log("| read | database | runs | range | indexes | n | median ms | found | index used |\n| -- | -- | -- | -- | -- | -- | -- | -- | -- |");

        foreach ($this->spanReads($reads) as [$label, $unbounded, $read]) {
            if ($this->only !== '' && preg_match('/'.$this->only.'/', $label) !== 1) {
                continue;
            }

            foreach ($ranges as $preset => $range) {
                if ($unbounded && $preset !== array_key_first($ranges)) {
                    continue;
                }

                $key = $unbounded ? 'all' : $preset;
                $this->expected["{$key}|{$label}"] = $this->arrayOf($this->measure($db, $driver, $rows, $key, 'migrations', $label, fn () => $read($range, $context[$preset])));
            }
        }

        foreach (['summaries' => fn () => $this->summaries($db, $driver, $rows, $ranges, $context, $reads), 'writes' => fn () => $this->writes($db, $driver, $rows, $now)] as $section => $run) {
            try {
                $run();
            } catch (\Throwable $exception) {
                $this->log("\nThe {$section} section stopped: ".mb_substr(preg_replace('/\s+/', ' ', $exception->getMessage()) ?? '', 0, 300)."\n");
            }
        }

        $schema->dropIfExists('trail_trace_models');
        $schema->dropIfExists('trail_trace_tools');
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function arrayOf(mixed $result): array
    {
        return is_array($result) ? array_values(array_map(fn (mixed $row) => (array) $row, $result)) : [];
    }

    /**
     * The buckets of each range for the forecast, and the last six complete ones with the range they span.
     *
     * @param  array<string, TimeRange>  $ranges
     * @return array<string, array{cuts: list<array<string, mixed>>, last: list<array<string, mixed>>, tail: TimeRange}>
     */
    private function context(array $ranges): array
    {
        $context = [];

        foreach ($ranges as $preset => $range) {
            $cuts = BucketUnit::for($range)->buckets($range);
            $last = array_slice(array_values(array_filter($cuts, fn (array $cut) => $cut['full'])), -6);
            $context[$preset] = ['cuts' => $cuts, 'last' => $last, 'tail' => new TimeRange(null, $last[0]['from'], $last[count($last) - 1]['to'])];
        }

        return $context;
    }

    /**
     * Every read of spans as they are: its label, whether it is unbounded in time, and the read.
     *
     * @return list<array{0: string, 1: bool, 2: Closure(TimeRange, array<string, mixed>): mixed}>
     */
    private function spanReads(UsageReads $reads): array
    {
        $big = AgentMeasurement::BIG_AGENT;

        return [
            ['A1a models, no run count', false, fn (TimeRange $r) => $reads->modelsOnSpans($r, 'none')],
            ['A1b models, runs of billing spans', false, fn (TimeRange $r) => $reads->modelsOnSpans($r, 'billing')],
            ['A1c models, runs of any span', false, fn (TimeRange $r) => $reads->modelsOnSpans($r, 'any')],
            ['A2a providers, no run count', false, fn (TimeRange $r) => $reads->providersOnSpans($r, 'none')],
            ['A2b providers, runs of billing spans', false, fn (TimeRange $r) => $reads->providersOnSpans($r, 'billing')],
            ['A2c providers, runs of any span', false, fn (TimeRange $r) => $reads->providersOnSpans($r, 'any')],
            ['A3a agents, from the runs', false, fn (TimeRange $r) => $reads->agentsOnTraces($r)],
            ['A3b agents, from the spans', false, fn (TimeRange $r) => $reads->agentsOnSpans($r)],
            ['A3c agents and models, from the spans', false, fn (TimeRange $r) => $reads->agentModelsOnSpans($r)],
            ['A4a buckets, whole range', false, fn (TimeRange $r, array $c) => $reads->bucketsOnSpans($r, $c['cuts'])],
            ['A4b buckets, last 6 complete', false, fn (TimeRange $r, array $c) => $reads->bucketsOnSpans($c['tail'], $c['last'])],
            ['A5 observed models, unbounded', true, fn () => $reads->observedOnSpans()],
            ['A6 overview totals', false, fn (TimeRange $r) => ['buckets' => $reads->overview($r)->buckets]],
            ['A7a tools, all agents', false, fn (TimeRange $r) => $reads->toolsOnSpans($r)],
            ['A7b tools, big agent (AgentBreakdown)', false, fn (TimeRange $r) => (new AgentBreakdown)->tools($big, $r)],
            ['A7c models, big agent (AgentBreakdown)', false, fn (TimeRange $r) => (new AgentBreakdown)->models($big, $r)],
        ];
    }

    // The summaries ------------------------------------------------------------------------------------------

    /**
     * @param  array<string, TimeRange>  $ranges
     * @param  array<string, array{cuts: list<array<string, mixed>>, last: list<array<string, mixed>>, tail: TimeRange}>  $context
     */
    private function summaries(Connection $db, string $driver, int $rows, array $ranges, array $context, UsageReads $reads): void
    {
        $this->create($db);
        $this->backfill($db, $driver);

        foreach (array_filter(array_map('trim', explode(',', $this->configs))) as $config) {
            $names = match ($config) {
                'none' => [],
                'all' => array_keys(self::INDEXES),
                default => array_map(fn (string $name) => isset(self::INDEXES[$name]) ? $name : throw new \InvalidArgumentException("Unknown index {$name}."), explode('+', $config)),
            };

            $built = $this->build($db, $driver, $names);

            foreach ($this->summaryReads($reads) as [$label, $against, $keys, $skip, $read]) {
                if ($this->only !== '' && preg_match('/'.$this->only.'/', $label) !== 1) {
                    continue;
                }

                foreach ($ranges as $preset => $range) {
                    $unbounded = str_starts_with($label, 'B5');

                    if ($unbounded && $preset !== array_key_first($ranges)) {
                        continue;
                    }

                    $key = $unbounded ? 'all' : $preset;
                    $result = $this->measure($db, $driver, $rows, $key, $config, $label, fn () => $read($range, $context[$preset]), planAll: true);

                    if ($against !== null && $result !== null) {
                        $this->agree($driver, $rows, $key, $config, $label, $against, $keys, $skip, $this->arrayOf($result));
                    }
                }
            }

            $this->log("\n(indexes \"{$config}\": ".implode('; ', $built).')');
            $this->log($this->sizes("sizes with \"{$config}\"", MeasureDatabase::sizes($db, $driver, ['trail_traces', 'trail_spans', ...self::TABLES])));
            $this->drop($db, $driver, $names);
        }
    }

    /**
     * The reads on the summaries: label, the span read it must agree with (null for none), its key
     * columns, columns left out of the comparison, and the read.
     *
     * @return list<array{0: string, 1: ?string, 2: list<string>, 3: list<string>, 4: Closure(TimeRange, array<string, mixed>): mixed}>
     */
    private function summaryReads(UsageReads $reads): array
    {
        $big = AgentMeasurement::BIG_AGENT;
        $pm = ['provider', 'model'];

        return [
            ['B1 models, count(*)', 'A1c models, runs of any span', $pm, [], fn (TimeRange $r) => $reads->modelsOnSummary($r, $pm, 'rows')],
            ['B2a providers, count(*)', 'A2c providers, runs of any span', ['provider'], ['runs'], fn (TimeRange $r) => $reads->modelsOnSummary($r, ['provider'], 'rows')],
            ['B2b providers, count(distinct trace_id)', 'A2c providers, runs of any span', ['provider'], [], fn (TimeRange $r) => $reads->modelsOnSummary($r, ['provider'], 'distinct')],
            ['B3 agents and models', 'A3c agents and models, from the spans', ['name', 'provider', 'model'], [], fn (TimeRange $r) => $reads->modelsOnSummary($r, ['name', 'provider', 'model'], 'rows')],
            ['B4a buckets, whole range', 'A4a buckets, whole range', ['slot', 'provider', 'model'], [], fn (TimeRange $r, array $c) => $reads->bucketsOnSummary($r, $c['cuts'])],
            ['B4b buckets, last 6 complete', 'A4b buckets, last 6 complete', ['slot', 'provider', 'model'], [], fn (TimeRange $r, array $c) => $reads->bucketsOnSummary($c['tail'], $c['last'])],
            ['B5a observed models, billing', 'A5 observed models, unbounded', $pm, [], fn () => $reads->observedOnSummary(true)],
            ['B5b observed models, any row', null, $pm, [], fn () => $reads->observedOnSummary(false)],
            ['B6a models, big agent', 'A7c models, big agent (AgentBreakdown)', $pm, [], fn (TimeRange $r) => $reads->modelsOnSummary($r, $pm, 'rows', $big)],
            ['B6b tools, big agent', 'A7b tools, big agent (AgentBreakdown)', ['name'], [], fn (TimeRange $r) => $reads->toolsOnSummary($r, $big)],
            ['B6c tools, all agents', 'A7a tools, all agents', ['name'], [], fn (TimeRange $r) => $reads->toolsOnSummary($r, null)],
        ];
    }

    private function create(Connection $db): void
    {
        $schema = $db->getSchemaBuilder();

        $schema->create('trail_trace_models', function (Blueprint $table) {
            $table->string('trace_id', 64);
            $table->string('provider');
            $table->string('model');
            $table->dateTime('started_at', 3);
            $table->string('name');
            $table->unsignedInteger('steps');
            $table->unsignedInteger('unpriced_steps');
            $table->unsignedInteger('running_steps');

            foreach (UsageReads::TOKENS as $token) {
                $table->unsignedBigInteger($token)->nullable();
            }

            $table->decimal('cost', 18, 10)->nullable();
        });

        $schema->create('trail_trace_tools', function (Blueprint $table) {
            $table->string('trace_id', 64);
            $table->string('name');
            $table->dateTime('started_at', 3);
            $table->string('run_name');
            $table->unsignedInteger('calls');
            $table->unsignedInteger('failed');
        });
    }

    /**
     * Fill both tables from the spans and the runs with one insert-select each: what a database that
     * already holds runs would run once.
     */
    private function backfill(Connection $db, string $driver): void
    {
        $bills = "s.type in ('step', 'embedding')";
        $reported = '(s.input_tokens is not null or s.output_tokens is not null or s.cache_read_tokens is not null or s.cache_write_tokens is not null or s.reasoning_tokens is not null)';
        $tokens = implode(', ', array_map(fn (string $token) => "sum(case when {$bills} then s.{$token} end)", UsageReads::TOKENS));

        // The statements are not reads, so the timeout that stops one is lifted for them.
        match ($driver) {
            'pgsql' => $db->statement('set statement_timeout = 0'),
            default => null,
        };

        $start = hrtime(true);
        $db->statement("insert into trail_trace_models (trace_id, provider, model, started_at, name, steps, unpriced_steps, running_steps, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens, cost)
            select s.trace_id, s.provider, s.model, t.started_at, t.name,
                sum(case when {$bills} then 1 else 0 end),
                sum(case when {$bills} and s.cost is null and {$reported} then 1 else 0 end),
                sum(case when {$bills} and s.status = 'running' and s.created_at >= ? then 1 else 0 end),
                {$tokens}, sum(case when {$bills} then s.cost end)
            from trail_spans s join trail_traces t on t.id = s.trace_id
            where s.provider is not null and s.model is not null
            group by s.trace_id, s.provider, s.model, t.started_at, t.name", [StaleRuns::cutoffColumn()]);
        $models = (hrtime(true) - $start) / 1e9;

        $start = hrtime(true);
        $db->statement("insert into trail_trace_tools (trace_id, name, started_at, run_name, calls, failed)
            select s.trace_id, s.name, t.started_at, t.name, count(*), sum(case when s.status = 'failed' then 1 else 0 end)
            from trail_spans s join trail_traces t on t.id = s.trace_id
            where s.type = 'tool'
            group by s.trace_id, s.name, t.started_at, t.name");
        $tools = (hrtime(true) - $start) / 1e9;

        MeasureDatabase::limit($db, $driver);
        MeasureDatabase::analyse($db, $driver, self::TABLES);

        $runs = (int) $db->table('trail_traces')->count();
        $modelRows = (int) $db->table('trail_trace_models')->count();
        $toolRows = (int) $db->table('trail_trace_tools')->count();
        $this->log(sprintf("\nBackfill without secondary indexes: trail_trace_models %s rows (%.2f per run, of which %s with no billing span) in %.1f s; trail_trace_tools %s rows (%.2f per run) in %.1f s.\n", number_format($modelRows), $modelRows / max(1, $runs), number_format((int) $db->table('trail_trace_models')->where('steps', 0)->count()), $models, number_format($toolRows), $toolRows / max(1, $runs), $tools));
    }

    /**
     * @param  list<string>  $names
     * @return list<string> what each index took to build
     */
    private function build(Connection $db, string $driver, array $names): array
    {
        $built = [];

        foreach ($names as $name) {
            foreach (self::INDEXES[$name] as $table => $columns) {
                $start = hrtime(true);
                $db->statement('create index '.self::indexName($name, $table)." on {$table} ({$columns})");
                $built[] = sprintf('%s (%s) built in %.1f s', self::indexName($name, $table), $columns, (hrtime(true) - $start) / 1e9);
            }
        }

        MeasureDatabase::analyse($db, $driver, self::TABLES);

        return $built;
    }

    /**
     * @param  list<string>  $names
     */
    private function drop(Connection $db, string $driver, array $names): void
    {
        foreach ($names as $name) {
            foreach (array_keys(self::INDEXES[$name]) as $table) {
                $index = self::indexName($name, $table);
                $db->statement($driver === 'mysql' ? "drop index {$index} on {$table}" : "drop index {$index}");
            }
        }
    }

    private static function indexName(string $name, string $table): string
    {
        return 'hyp_'.($table === 'trail_trace_models' ? 'tm' : 'tt')."_{$name}";
    }

    // Agreement ----------------------------------------------------------------------------------------------------

    /**
     * @param  list<string>  $keys
     * @param  list<string>  $skip
     * @param  list<array<string, mixed>>  $found
     */
    private function agree(string $driver, int $rows, string $range, string $config, string $label, string $against, array $keys, array $skip, array $found): void
    {
        if ($driver !== 'sqlite' && $rows > $this->checkMax) {
            return;
        }

        $expected = $this->expected["{$range}|{$against}"] ?? null;

        if ($expected === null) {
            return;
        }

        $one = $this->normalise($expected, $keys, $skip, $driver);
        $other = $this->normalise($found, $keys, $skip, $driver);

        if ($label === 'B2a providers, count(*)' && $config === 'none') {
            $this->log(sprintf('Check: %s %s: runs summed over providers is %d from count(*) and %d from count(distinct trace_id).', $driver, $range, array_sum(array_column($found, 'runs')), array_sum(array_column($expected, 'runs'))));
        }

        if ($one === $other) {
            return;
        }

        $differing = array_values(array_unique([...array_keys(array_diff_key($one, $other)), ...array_keys(array_diff_key($other, $one)), ...array_keys(array_filter($one, fn (array $values, string $key) => isset($other[$key]) && $other[$key] !== $values, ARRAY_FILTER_USE_BOTH))]));
        $example = $differing[0];
        $this->findings[] = sprintf('%s %s runs %s, indexes "%s": "%s" differs from "%s" in %d of %d groups; e.g. %s: spans %s, summary %s', $driver, number_format($rows), $range, $config, $label, $against, count($differing), count($one), $example, json_encode($one[$example] ?? null), json_encode($other[$example] ?? null));
    }

    /**
     * Rows by their key, with numbers as strings: whole numbers as integers and a cost to ten places.
     *
     * @param  list<array<string, mixed>>  $rows
     * @param  list<string>  $keys
     * @param  list<string>  $skip
     * @return array<string, array<string, string>>
     */
    private function normalise(array $rows, array $keys, array $skip, string $driver): array
    {
        $normalised = [];

        foreach ($rows as $row) {
            $values = [];

            foreach ($row as $column => $value) {
                if (in_array($column, $keys, true) || in_array($column, $skip, true)) {
                    continue;
                }

                $values[$column] = match (true) {
                    $value === null => 'null',
                    $column === 'cost_sum' || $column === 'cost' => $driver === 'sqlite' ? sprintf('%.6f', (float) (is_numeric($value) ? $value : 0)) : bcadd(is_numeric($value) ? (string) $value : '0', '0', 10),
                    default => (string) (is_numeric($value) ? (int) $value : $value),
                };
            }

            $normalised[implode('|', array_map(fn (string $key) => (string) $row[$key], $keys))] = $values;
        }

        ksort($normalised);

        return $normalised;
    }

    // Timing ---------------------------------------------------------------------------------------------------------

    private function measure(Connection $db, string $driver, int $rows, string $range, string $config, string $label, Closure $read, bool $planAll = false): mixed
    {
        $timing = $this->timer->time($db, $read);

        if ($timing['error'] !== null) {
            $this->log(sprintf('| %s | %s | %s | %s | %s | %d | FAILED | | %s |', $label, $driver, number_format($rows), $range, $config, $timing['repeats'], $timing['error']));

            return null;
        }

        $used = [];

        foreach ($timing['statements'] as $index => $executed) {
            $slow = ($timing['per_query'][$index] ?? 0.0) > self::PLAN_THRESHOLD;

            if ($driver === 'sqlite' || ! ($slow || $planAll)) {
                continue;
            }

            $plan = MeasureDatabase::plan($db, $driver, $executed->sql, $executed->bindings);
            preg_match('/-- index used: (.*)$/', $plan, $match);
            $used[] = $match[1] ?? '';

            if ($slow) {
                $this->log(sprintf("\nPlan for Q%d of \"%s\", %s, %s runs, indexes \"%s\", median %.1f ms:\n```\n%s\n```\n", $index + 1, $label, $range, number_format($rows), $config, $timing['per_query'][$index], $plan));
            }
        }

        $result = $timing['result'];
        $found = is_array($result) ? (isset($result['buckets']) && is_array($result['buckets']) ? count($result['buckets']).' buckets' : count($result).' rows') : '';
        $this->log(sprintf('| %s | %s | %s | %s | %s | %d | %.1f | %s | %s |', $label, $driver, number_format($rows), $range, $config, $timing['repeats'], $timing['median'], $found, implode('; ', array_unique($used))));

        return $result;
    }

    // What the write costs ------------------------------------------------------------------------------------------

    /**
     * Flushes of bench runs with 1, 2 and 4 distinct models into the full tables: first with the
     * indexes a read wants and a plain index on the run, then with a unique index on the run and its
     * models (what an upsert needs). The modes are interleaved run by run, so drift hits them alike.
     */
    private function writes(Connection $db, string $driver, int $rows, CarbonImmutable $now): void
    {
        $runs = $driver === 'sqlite' ? 10 : $this->writeRuns;
        $this->build($db, $driver, array_keys(self::INDEXES));
        $this->log("\nCost of a flush ({$driver}, summary tables holding the full volume, {$runs} runs per cell; each flush is one transaction, commit included; ms):\n");
        $this->log("| indexes | models | mode | pass | statements | median | p95 |\n| -- | -- | -- | -- | -- | -- | -- |");

        $this->flushes($db, $driver, 'plain', ['baseline', 'delete-insert'], $runs, $now);
        $this->collision($db, $driver, 'plain', ['delete-insert']);

        foreach (array_keys(self::INDEXES['trace']) as $table) {
            $db->statement($driver === 'mysql' ? 'drop index '.self::indexName('trace', $table)." on {$table}" : 'drop index '.self::indexName('trace', $table));
        }

        $db->statement('create unique index hyp_tm_unique on trail_trace_models (trace_id, provider, model)');
        $db->statement('create unique index hyp_tt_unique on trail_trace_tools (trace_id, name)');
        MeasureDatabase::analyse($db, $driver, self::TABLES);

        $this->flushes($db, $driver, 'unique', ['baseline', 'delete-insert', 'upsert'], $runs, $now);
        $this->collision($db, $driver, 'unique', ['delete-insert', 'upsert']);

        foreach (['trail_trace_models' => 'hyp_tm_unique', 'trail_trace_tools' => 'hyp_tt_unique'] as $table => $index) {
            $db->statement($driver === 'mysql' ? "drop index {$index} on {$table}" : "drop index {$index}");
        }

        $this->drop($db, $driver, ['started', 'pms', 'name']);
        $this->cleanup($db);
    }

    /**
     * @param  list<string>  $modes
     */
    private function flushes(Connection $db, string $driver, string $indexes, array $modes, int $runs, CarbonImmutable $now): void
    {
        $writer = new SummaryWriter($db);
        $template = (new SpanFixture(1))->forRun(['id' => 'template', 'name' => 'BenchAgent', 'status' => 'completed', 'duration_ms' => 1500.0], 0)[0];
        $count = 0;
        $db->listen(function () use (&$count) {
            $count++;
        });
        $next = $now->getTimestampMs() + 1000;

        foreach ([1, 2, 4] as $models) {
            $set = [];
            $spans = [];
            $traces = [];

            foreach ($modes as $mode) {
                for ($index = 0; $index < $runs; $index++) {
                    $id = sprintf('ffffffff-bench-%s-%d-%s-%05d', $indexes, $models, substr($mode, 0, 2), $index);
                    $started = gmdate('Y-m-d H:i:s', intdiv($next, 1000)).sprintf('.%03d', $next % 1000);
                    $set[$mode][] = [$id, $started];
                    array_push($spans, ...SummaryWriter::benchSpans($id, $models, $next, $template, $index));
                    $traces[] = ['id' => $id, 'type' => 'agent', 'name' => 'BenchAgent', 'status' => 'completed', 'started_at' => $started, 'created_at' => $started, 'updated_at' => $started];
                    $next += 10;
                }
            }

            foreach (array_chunk($traces, 500) as $chunk) {
                $db->table('trail_traces')->insert($chunk);
            }

            foreach (array_chunk($spans, 500) as $chunk) {
                $db->table('trail_spans')->insert($chunk);
            }

            foreach (['first', 'again'] as $pass) {
                $times = [];
                $statements = [];

                for ($index = 0; $index < $runs; $index++) {
                    foreach (array_keys($modes) as $position) {
                        // The mode that goes first alternates, so none is always the one that follows a pause.
                        $mode = $modes[($position + $index) % count($modes)];
                        [$id, $started] = $set[$mode][$index];
                        $count = 0;
                        $start = hrtime(true);
                        $writer->flush($id, 'BenchAgent', $started, $mode);
                        $times[$mode][] = (hrtime(true) - $start) / 1e6;
                        $statements[$mode] = $count;
                    }
                }

                foreach ($modes as $mode) {
                    sort($times[$mode]);
                    $this->log(sprintf('| %s | %d | %s | %s | %d | %.2f | %.2f |', $indexes, $models, $mode, $pass, $statements[$mode], $times[$mode][intdiv(count($times[$mode]), 2)], $times[$mode][min(count($times[$mode]) - 1, (int) ceil(0.95 * count($times[$mode])) - 1)]));
                }
            }
        }
    }

    /**
     * A run that has the same model, and the same tool, spelled in two cases: what each way of writing
     * and of reading it does on this database.
     */
    /**
     * @param  list<string>  $modes
     */
    private function collision(Connection $db, string $driver, string $indexes, array $modes): void
    {
        $writer = new SummaryWriter($db);
        $started = gmdate('Y-m-d H:i:s').'.000';
        $id = "ffffffff-bench-case-{$indexes}";
        $template = (new SpanFixture(1))->forRun(['id' => 'template', 'name' => 'BenchAgent', 'status' => 'completed', 'duration_ms' => 1500.0], 0)[0];
        $blank = array_fill_keys(array_keys($template), null) + ['attempt' => 1, 'redacted' => 0, 'truncated' => 0];
        $span = fn (string $suffix, string $type, string $name, ?string $model, int $tokens): array => [...$blank, 'id' => "{$id}-{$suffix}", 'trace_id' => $id, 'type' => $type, 'name' => $name, 'status' => 'completed', 'sequence' => 1,
            'provider' => $model === null ? null : 'openai', 'model' => $model, 'input_tokens' => $model === null ? null : $tokens, 'started_at' => $started, 'created_at' => $started, 'updated_at' => $started];

        $db->table('trail_traces')->insert(['id' => $id, 'type' => 'agent', 'name' => 'BenchAgent', 'status' => 'completed', 'started_at' => $started, 'created_at' => $started, 'updated_at' => $started]);
        $db->table('trail_spans')->insert([$span('a', 'step', 'step', 'GPT-5', 10), $span('b', 'step', 'step', 'gpt-5', 20), $span('c', 'tool', 'Search', null, 0), $span('d', 'tool', 'search', null, 0)]);

        $show = fn (string $sql): string => json_encode(array_map(fn (object $row) => (array) $row, $db->select($sql, [$id])));
        $this->log("\nCase collision ({$driver}, {$indexes} index on the run): a run with steps on models GPT-5 (10 input tokens) and gpt-5 (20), and tools Search and search.");
        $this->log('- spans, grouped by model: '.$show('select model, count(*) as steps, sum(input_tokens) as input from trail_spans where trace_id = ? and type = \'step\' group by model'));

        foreach ($modes as $mode) {
            $db->table('trail_trace_models')->where('trace_id', $id)->delete();
            $db->table('trail_trace_tools')->where('trace_id', $id)->delete();

            try {
                $writer->flush($id, 'BenchAgent', $started, $mode);
                $outcome = 'ok';
            } catch (\Throwable $exception) {
                $outcome = get_class($exception).': '.mb_substr(preg_replace('/\s+/', ' ', $exception->getMessage()) ?? '', 0, 150);
            }

            $this->log("- {$mode}: {$outcome}");
            $this->log('  - summary rows of the run: '.$show('select model, steps, input_tokens from trail_trace_models where trace_id = ? order by model'));
            $this->log('  - tool rows of the run: '.$show('select name, calls from trail_trace_tools where trace_id = ? order by name'));
            $this->log('  - summary grouped by model: '.$show('select model, sum(steps) as steps, sum(input_tokens) as input from trail_trace_models where trace_id = ? group by model'));
        }

        // What it left would stop the unique index being built.
        $db->table('trail_trace_models')->where('trace_id', $id)->delete();
        $db->table('trail_trace_tools')->where('trace_id', $id)->delete();
    }

    private function cleanup(Connection $db): void
    {
        foreach (['trail_spans' => 'trace_id', 'trail_traces' => 'id', 'trail_trace_models' => 'trace_id', 'trail_trace_tools' => 'trace_id'] as $table => $column) {
            $db->table($table)->where($column, 'like', 'ffffffff-bench-%')->delete();
        }
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

        return "{$title}: ".implode(', ', array_map(fn (string $name, int $bytes) => sprintf('%s %.1f MiB', $name, $bytes / 1048576), array_keys($sizes), $sizes))."\n";
    }

    private function log(string $line): void
    {
        fwrite(STDERR, $line."\n");

        if ($this->output !== '') {
            file_put_contents($this->output, $line."\n", FILE_APPEND);
        }
    }
}
