<?php

namespace Astro\Trail\Tests\Performance;

use Astro\Trail\Queries\AgentFilters;
use Astro\Trail\Queries\AgentIndex;
use Astro\Trail\Queries\ConversationFilters;
use Astro\Trail\Queries\ConversationIndex;
use Astro\Trail\Queries\Page;
use Astro\Trail\Queries\Search;
use Astro\Trail\Queries\SearchTerm;
use Astro\Trail\Queries\TimeRange;
use Astro\Trail\Queries\TraceFilters;
use Astro\Trail\Queries\TraceIndex;
use Carbon\CarbonImmutable;
use Closure;
use Illuminate\Database\Connection;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Times the reads behind the search endpoint on the databases the package supports, with the
 * indexes of the migrations only, and prints the plans of the reads by id. Driven by environment
 * variables; see SearchQueriesTest.
 */
final class SearchMeasurement
{
    /** @var array<string, int> range => seconds */
    private const RANGES = ['24h' => 86400, '7d' => 604800];

    /** @var list<string> */
    public array $findings = [];

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
            $name = MeasureDatabase::connect($driver);
            $db = DB::connection($name);
            assert($db instanceof Connection);

            $this->log("\n## {$driver} ({$db->selectOne('select '.($driver === 'sqlite' ? 'sqlite_version()' : 'version()').' as version')->version})\n");
            MeasureDatabase::migrate($name);
            MeasureDatabase::limit($db, $driver);

            // SQLite is only a sanity check here: an in-memory database with a few thousand rows.
            $volumes = $driver === 'sqlite' ? (is_string($rows = getenv('TRAIL_MEASURE_SQLITE_ROWS')) && $rows !== '' ? $rows : '5000') : $this->volumes;

            foreach (array_filter(array_map('intval', explode(',', $volumes))) as $rows) {
                $this->volume($db, $driver, $rows);
            }
        }

        Carbon::setTestNow();
        CarbonImmutable::setTestNow();

        $this->log("\n## Findings\n\n".($this->findings === [] ? "None: every read found what the fixture holds.\n" : '- '.implode("\n- ", $this->findings)."\n"));
    }

    private function volume(Connection $db, string $driver, int $rows): void
    {
        $now = CarbonImmutable::now()->setMicroseconds(0);
        Carbon::setTestNow($now);
        CarbonImmutable::setTestNow($now);

        $db->table('trail_traces')->truncate();
        $start = hrtime(true);
        OverviewFixture::seed($db, $rows, $now, text: true);
        MeasureDatabase::analyse($db, $driver);
        $this->log(sprintf("\n### %s, %s rows (seeded in %.1f s; analysed; spans table empty)\n", $driver, number_format($rows), (hrtime(true) - $start) / 1e9));

        $middle = $db->table('trail_traces')->orderBy('started_at')->offset(intdiv($rows, 2))->limit(1)->first(['id']);
        $conversation = $db->table('trail_traces')->whereNotNull('conversation_id')->orderBy('started_at')->offset(intdiv($rows, 3))->limit(1)->first(['conversation_id']);
        $id = is_string($middle?->id ?? null) ? $middle->id : '';
        $conversationId = is_string($conversation?->conversation_id ?? null) ? $conversation->conversation_id : '';

        $this->log($this->distribution($db));
        $this->log("| read | range | queries | median ms | per query (median ms) | found |\n| -- | -- | -- | -- | -- | -- |");

        $timer = new ReadTimer($this->repeats);
        $traces = new TraceIndex;
        $conversations = new ConversationIndex;
        $agents = new AgentIndex;
        $search = app(Search::class);

        // The reads by id take no range.
        $this->measure($db, $driver, $timer, 'run: whole id (found)', '-', fn () => $traces->withId($id, 6)->count(), 1, plan: true);
        $this->measure($db, $driver, $timer, 'run: whole id (no such run)', '-', fn () => $traces->withId('ffffffff-ffff-7fff-bfff-ffffffffffff', 6)->count(), 0, plan: true);
        $this->measure($db, $driver, $timer, 'run: 8-character prefix (found)', '-', fn () => $traces->withId(substr($id, 0, 8), 6)->count(), 'some', plan: true);
        $this->measure($db, $driver, $timer, 'run: 8-character prefix (none)', '-', fn () => $traces->withId('00000000', 6)->count(), 0, plan: true);
        $this->measure($db, $driver, $timer, 'conversation: whole id (found)', '-', fn () => $conversations->exact($conversationId) === null ? 0 : 1, 1, plan: true);
        $this->measure($db, $driver, $timer, 'conversation: whole id (none)', '-', fn () => $conversations->exact('conversation-none') === null ? 0 : 1, 0, plan: true);

        foreach (array_keys(self::RANGES) as $preset) {
            $range = new TimeRange($preset, $now->subSeconds(self::RANGES[$preset]), $now);

            foreach (['frequent' => 'invoice', 'rare' => 'refund', 'none' => 'qqzzxx'] as $kind => $text) {
                $this->measure($db, $driver, $timer, "runs: text, {$kind} (\"{$text}\")", $preset, fn () => $traces->rows($range, new TraceFilters(search: $text), null, new Page(1, 6))->count(), self::expect($kind));
                $this->measure($db, $driver, $timer, "conversations: text, {$kind} (\"{$text}\")", $preset, fn () => count($conversations->ids($range, new ConversationFilters(search: $text), new Page(1, 6))), self::expect($kind));
            }

            foreach (['frequent' => 'assistant', 'none' => 'qqzzxx'] as $kind => $text) {
                $this->measure($db, $driver, $timer, "agents: text, {$kind} (\"{$text}\")", $preset, fn () => count($agents->list($range, new AgentFilters(search: $text), new Page(1, 5))->agents), self::expect($kind));
            }

            foreach (['frequent' => 'invoice', 'rare' => 'refund', 'none' => 'qqzzxx', 'a run id' => substr($id, 0, 8)] as $kind => $text) {
                $this->measure($db, $driver, $timer, "the endpoint: {$kind} (\"{$text}\")", $preset, function () use ($search, $range, $text) {
                    $found = $search->read($range, new SearchTerm($text));

                    return count($found->traces) + count($found->conversations) + count($found->agents);
                }, self::expect($kind));
            }
        }

        $this->log('');
    }

    /**
     * @param  Closure(): int  $read  returns how many items it found
     * @param  int|'some'|null  $expected  how many it must find, or that it must find some, or null when the range may hold none
     */
    private function measure(Connection $db, string $driver, ReadTimer $timer, string $label, string $range, Closure $read, int|string|null $expected, bool $plan = false): void
    {
        $timed = $timer->time($db, $read);

        if ($timed['error'] !== null) {
            $this->log("| {$label} | {$range} | - | error | {$timed['error']} | |");
            $this->findings[] = "{$driver} {$label} {$range}: {$timed['error']}";

            return;
        }

        $split = implode(', ', array_map(fn (int $index, float $ms) => sprintf('Q%d %.1f', $index + 1, $ms), array_keys($timed['per_query']), $timed['per_query']));
        $found = is_int($timed['result']) ? $timed['result'] : 0;
        $this->log(sprintf('| %s | %s | %d | %.1f | %s | %d |', $label, $range, count($timed['statements']), $timed['median'], $split, $found));

        if (is_int($expected) && $found !== $expected) {
            $this->findings[] = "{$driver} {$label} {$range}: found {$found}, expected {$expected}.";
        }

        if ($expected === 'some' && $found === 0) {
            $this->findings[] = "{$driver} {$label} {$range}: found nothing, and the fixture holds a match.";
        }

        if ($plan && $driver !== 'sqlite') {
            foreach ($timed['statements'] as $index => $executed) {
                $this->log("\nPlan for Q".($index + 1)." of \"{$label}\":\n```");
                $this->log(MeasureDatabase::plan($db, $driver, $executed->sql, $executed->bindings));
                $this->log("```\n");
            }
        }
    }

    private static function expect(string $kind): int|string|null
    {
        return match ($kind) {
            'none' => 0,
            'frequent', 'a run id' => 'some',
            default => null,
        };
    }

    private function distribution(Connection $db): string
    {
        $row = $db->selectOne("select count(*) as total, sum(case when lower(prompt_excerpt) like '%invoice%' then 1 else 0 end) as invoice, sum(case when lower(prompt_excerpt) like '%refund%' then 1 else 0 end) as refund, count(distinct conversation_id) as conversations from trail_traces");

        return sprintf("Fixture: %s runs; %s mention an invoice, %s a refund, none \"qqzzxx\"; %s conversations.\n", number_format((int) $row->total), number_format((int) $row->invoice), number_format((int) $row->refund), number_format((int) $row->conversations));
    }

    private function log(string $line): void
    {
        fwrite(STDERR, $line."\n");

        if ($this->output !== '') {
            file_put_contents($this->output, $line."\n", FILE_APPEND);
        }
    }
}
