<?php

use Astro\Trail\Enums\IssueKind;
use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Http\Resources\TraceCsv;
use Astro\Trail\Queries\TraceIndex;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Astro\Trail\Tests\Fixtures\Users\User;
use Illuminate\Auth\GenericUser;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

beforeEach(function () {
    $this->app['env'] = 'local';
    Carbon::setTestNow('2026-01-02 12:00:00');
});

afterEach(fn () => Carbon::setTestNow());

/**
 * The export of a request, parsed: the header and the runs, each keyed by column.
 *
 * @return array{header: list<string>, rows: list<array<string, string>>, content: string}
 */
function exportAt(mixed $test, string $query = ''): array
{
    $response = $test->get('/trail/api/traces/export'.($query === '' ? '' : '?'.$query));
    $response->assertOk();

    $content = $response->streamedContent();
    expect($content)->toStartWith(TraceCsv::BYTE_ORDER_MARK);

    $stream = fopen('php://memory', 'w+');
    fwrite($stream, substr($content, strlen(TraceCsv::BYTE_ORDER_MARK)));
    rewind($stream);

    $lines = [];

    while (($line = fgetcsv($stream, null, ',', '"', '')) !== false) {
        $lines[] = $line;
    }

    fclose($stream);

    $header = array_shift($lines);

    expect($header)->toBe(TraceCsv::COLUMNS);

    return [
        'header' => $header,
        'rows' => array_map(fn (array $line) => array_combine($header, $line), $lines),
        'content' => $content,
    ];
}

/**
 * @return list<string>
 */
function exportedIds(mixed $test, string $query = ''): array
{
    return array_column(exportAt($test, $query)['rows'], 'id');
}

/**
 * A finished run that started inside the default range.
 *
 * @param  array<string, mixed>  $attributes
 */
function exportable(string $id, array $attributes = []): Trace
{
    return Rows::trace([...['id' => $id, 'status' => Status::Completed, 'started_at' => '2026-01-02 10:00:00'], ...$attributes]);
}

/** One run of every kind the export tells apart. */
function exportDataset(): void
{
    DB::table('users')->insert(['id' => 7, 'name' => 'Ada', 'email' => 'ada@example.test', 'password' => 'x']);

    $full = exportable('run-full', [
        'name' => 'SupportAssistant', 'agent_class' => 'App\\Ai\\Agents\\SupportAssistant', 'streamed' => true,
        'provider' => 'anthropic', 'model' => 'claude-sonnet-4-5', 'duration_ms' => 1840.412,
        'input_tokens' => 1200, 'output_tokens' => 310, 'cache_read_tokens' => 5, 'cache_write_tokens' => 6, 'reasoning_tokens' => 7,
        'cost' => 0.00825, 'span_count' => 4, 'prompt_excerpt' => 'Where is my order?', 'response_excerpt' => 'Your order shipped on Monday.',
        'conversation_id' => 'conversation-1', 'user_id' => '7', 'user_type' => User::class,
        'started_at' => '2026-01-02 11:00:00', 'ended_at' => '2026-01-02 11:00:01.840',
    ]);
    Rows::bookmark($full);
    Rows::span($full, ['provider' => 'anthropic', 'model' => 'claude-sonnet-4-5', 'started_at' => '2026-01-02 11:00:00']);
    Rows::span($full, ['provider' => 'openai', 'model' => 'gpt-5', 'started_at' => '2026-01-02 11:00:00']);
    Rows::span($full, ['type' => SpanType::Tool, 'name' => 'lookup_order', 'started_at' => '2026-01-02 11:00:00']);

    $partial = exportable('run-partial', [
        'name' => 'TicketTriage', 'provider' => 'openai', 'model' => 'gpt-5', 'duration_ms' => 950.5, 'input_tokens' => 800, 'output_tokens' => 120,
        'cost' => 0.004, 'unpriced_span_count' => 1, 'span_count' => 3, 'started_at' => '2026-01-02 10:50:00', 'ended_at' => '2026-01-02 10:50:00.950',
    ]);
    Rows::span($partial, ['type' => SpanType::Tool, 'name' => 'lookup_order', 'started_at' => '2026-01-02 10:50:00']);
    Rows::span($partial, ['type' => SpanType::Tool, 'name' => 'send_email', 'started_at' => '2026-01-02 10:50:00']);
    exportable('run-unpriced', [
        'name' => 'TicketTriage', 'duration_ms' => 400.25, 'input_tokens' => 90, 'unpriced_span_count' => 1, 'span_count' => 1, 'started_at' => '2026-01-02 10:40:00',
    ]);
    exportable('run-bare', ['name' => 'Bare', 'started_at' => '2026-01-02 10:30:00']);
    exportable('run-running', ['name' => 'SupportAssistant', 'status' => Status::Running, 'input_tokens' => 300, 'cost' => 0.0012, 'span_count' => 2, 'started_at' => '2026-01-02 11:50:00']);
    exportable('run-stale', ['name' => 'Retired', 'status' => Status::Running, 'started_at' => '2026-01-02 10:00:00', 'created_at' => Carbon::now()->subHours(2)]);
    exportable('run-failed', [
        'name' => 'SupportAssistant', 'status' => Status::Failed, 'issue_kind' => IssueKind::RateLimited, 'recovered' => true, 'child_failed' => true,
        'duration_ms' => 120.75, 'user_id' => '999', 'user_type' => User::class, 'started_at' => '2026-01-02 10:20:00', 'ended_at' => '2026-01-02 10:20:00.120',
    ]);
    exportable('run-embedding', [
        'type' => SpanType::Embedding, 'name' => 'Embeddings', 'provider' => 'openai', 'model' => 'text-embedding-3-small', 'duration_ms' => 210.5,
        'input_tokens' => 64, 'cost' => 0.0000000001, 'span_count' => 1, 'started_at' => '2026-01-02 09:00:00',
    ]);
}

/**
 * What a cell of the file must hold for a value of the list: the list's own value, flattened.
 *
 * @param  array<string, mixed>  $row  a run of GET /api/traces
 * @return array<string, mixed>
 */
function flattenedListRow(array $row): array
{
    return [
        'id' => $row['id'], 'name' => $row['name'], 'type' => $row['type'], 'agent_class' => $row['agent_class'], 'status' => $row['status'],
        'issue_kind' => $row['issue_kind'], 'streamed' => $row['streamed'], 'recovered' => $row['recovered'], 'child_failed' => $row['child_failed'],
        'provider' => $row['provider'], 'model' => $row['model'], 'duration_ms' => $row['duration_ms'],
        'usage_state' => $row['usage']['state'], 'input_tokens' => $row['usage']['input_tokens'], 'output_tokens' => $row['usage']['output_tokens'],
        'cache_read_tokens' => $row['usage']['cache_read_tokens'], 'cache_write_tokens' => $row['usage']['cache_write_tokens'],
        'reasoning_tokens' => $row['usage']['reasoning_tokens'], 'total_tokens' => $row['usage']['total_tokens'],
        'cost_state' => $row['cost']['state'], 'cost_usd' => $row['cost']['amount'], 'span_count' => $row['span_count'],
        'conversation_id' => $row['conversation_id'],
        'user_id' => $row['user']['id'] ?? null, 'user_type' => $row['user']['type'] ?? null,
        'user_name' => $row['user']['name'] ?? null, 'user_email' => $row['user']['email'] ?? null,
        'bookmarked' => $row['bookmarked'], 'started_at' => $row['started_at'], 'ended_at' => $row['ended_at'],
        'prompt_excerpt' => $row['prompt_excerpt'], 'response_excerpt' => $row['response_excerpt'],
    ];
}

/** Whether a cell says what a value of the list says. */
function cellSays(string $cell, mixed $value): bool
{
    return match (true) {
        $value === null => $cell === '',
        is_bool($value) => $cell === ($value ? 'true' : 'false'),
        is_int($value), is_float($value) => is_numeric($cell) && abs((float) $cell - $value) < 1e-9,
        default => $cell === (preg_match('/^[=+\-@\t\r]/', (string) $value) === 1 ? "'" : '').$value,
    };
}

describe('against the list', function () {
    beforeEach(fn () => exportDataset());

    it('exports the runs of the list, in its order, with the list\'s values', function (string $query) {
        $list = $this->getJson('/trail/api/traces?'.$query.'&per_page=100')->assertOk()->json('data');
        $export = exportAt($this, $query)['rows'];

        expect($list)->not->toBeEmpty()
            ->and(array_column($export, 'id'))->toBe(array_column($list, 'id'));

        foreach ($list as $position => $row) {
            foreach (flattenedListRow($row) as $column => $value) {
                expect(cellSays($export[$position][$column], $value))->toBeTrue("{$query}: {$row['id']} {$column} is [{$export[$position][$column]}], the list says ".json_encode($value));
            }
        }
    })->with([
        'every run' => '',
        'a status' => 'status=completed',
        'failed' => 'status=failed',
        'an agent' => 'agent=SupportAssistant',
        'a search' => 'search=order',
        'a provider with spans' => 'provider=openai',
        'a tool' => 'tool=lookup_order',
        'a tool and a status' => 'tool=lookup_order&status=completed',
        'a provider and a model' => 'provider=anthropic&model=claude-sonnet-4-5',
        'bookmarked' => 'bookmarked=1',
        'slow' => 'slow=1',
        'unpriced' => 'unpriced=1',
        'a flag' => 'recovered=1',
        'a user' => 'user_id=7&user_type='.User::class,
        'an issue kind' => 'issue_kind=abandoned',
        'started_at' => 'sort=started_at',
        '-started_at' => 'sort=-started_at',
        'duration' => 'sort=duration',
        '-duration' => 'sort=-duration',
        'cost' => 'sort=cost',
        '-cost' => 'sort=-cost',
        'agent' => 'sort=agent',
        '-agent' => 'sort=-agent',
        'a filter and a sort' => 'status=completed&sort=-cost',
        'a range' => 'range=1h',
    ]);

    it('ignores page and per_page', function () {
        expect(exportedIds($this, 'page=3&per_page=2'))->toBe(exportedIds($this))
            ->and(count(exportedIds($this)))->toBe(8);
    });

    it('reports the runs written and the runs in the view in headers', function () {
        $response = $this->get('/trail/api/traces/export?status=completed');
        $response->streamedContent();

        $response->assertHeader('X-Trail-Export-Rows', '5')
            ->assertHeader('X-Trail-Export-Total', '5')
            ->assertHeader('X-Trail-Export-Truncated', 'false');
    });
});

describe('what was not captured', function () {
    beforeEach(fn () => exportDataset());

    it('writes an empty cell, never 0, for what a run did not report', function () {
        $rows = collect(exportAt($this)['rows'])->keyBy('id');
        $bare = $rows['run-bare'];
        $full = $rows['run-full'];

        foreach (['duration_ms', 'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'reasoning_tokens', 'total_tokens', 'cost_usd', 'provider', 'model', 'user_id', 'user_type', 'user_name', 'user_email', 'conversation_id', 'ended_at', 'agent_class', 'prompt_excerpt', 'response_excerpt'] as $column) {
            expect($bare[$column])->toBe('', $column)->and($full[$column])->not->toBe('', $column);
        }

        expect($bare['issue_kind'])->toBe('')
            ->and($rows['run-failed']['issue_kind'])->toBe('rate_limited')
            ->and($bare['span_count'])->toBe('0')
            ->and($bare['streamed'])->toBe('false')
            ->and($full['duration_ms'])->toBe('1840.412')
            ->and($full['total_tokens'])->toBe('1510')
            ->and($full['cost_usd'])->toBe('0.00825')
            ->and($full['user_name'])->toBe('Ada')
            ->and($full['user_email'])->toBe('ada@example.test')
            ->and($full['bookmarked'])->toBe('true')
            ->and($full['started_at'])->toBe('2026-01-02T11:00:00.000Z')
            ->and($full['ended_at'])->toBe('2026-01-02T11:00:01.840Z');
    });

    it('writes a user who can no longer be found by id alone', function () {
        $failed = collect(exportAt($this)['rows'])->firstWhere('id', 'run-failed');

        expect($failed['user_id'])->toBe('999')
            ->and($failed['user_type'])->toBe(User::class)
            ->and($failed['user_name'])->toBe('')
            ->and($failed['user_email'])->toBe('');
    });

    it('gives each cost state and usage state a column of its own', function () {
        $rows = collect(exportAt($this)['rows'])->keyBy('id');

        expect($rows['run-full']['cost_state'])->toBe('estimated')
            ->and($rows['run-partial']['cost_state'])->toBe('partial')
            ->and($rows['run-partial']['cost_usd'])->toBe('0.004')
            ->and($rows['run-unpriced']['cost_state'])->toBe('unpriced')
            ->and($rows['run-unpriced']['cost_usd'])->toBe('')
            ->and($rows['run-running']['cost_state'])->toBe('pending')
            ->and($rows['run-running']['cost_usd'])->toBe('0.0012')
            ->and($rows['run-bare']['cost_state'])->toBe('not_captured')
            ->and($rows['run-full']['usage_state'])->toBe('reported')
            ->and($rows['run-running']['usage_state'])->toBe('pending')
            ->and($rows['run-running']['input_tokens'])->toBe('300')
            ->and($rows['run-running']['output_tokens'])->toBe('')
            ->and($rows['run-bare']['usage_state'])->toBe('not_reported');
    });

    it('writes a stale running run as incomplete and abandoned', function () {
        $stale = collect(exportAt($this)['rows'])->firstWhere('id', 'run-stale');

        expect($stale['status'])->toBe('incomplete')
            ->and($stale['issue_kind'])->toBe('abandoned')
            ->and($stale['cost_state'])->toBe('not_captured')
            ->and($stale['usage_state'])->toBe('not_reported')
            ->and(exportedIds($this, 'status=incomplete'))->toBe(['run-stale'])
            ->and(exportedIds($this, 'status=running'))->toBe(['run-running']);
    });

    it('writes an amount of ten decimals, and a tiny one, without an exponent', function () {
        exportable('run-ten', ['cost' => 0.1234567891, 'started_at' => '2026-01-02 11:30:00']);
        $export = exportAt($this);
        $rows = collect($export['rows'])->keyBy('id');

        expect($rows['run-ten']['cost_usd'])->toBe('0.1234567891')
            ->and($rows['run-embedding']['cost_usd'])->toBe('0.0000000001')
            ->and($export['content'])->not->toContain('E-');
    });

    it('writes no negative number', function () {
        $export = exportAt($this);
        $numeric = ['duration_ms', 'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'reasoning_tokens', 'total_tokens', 'cost_usd', 'span_count', 'started_at', 'ended_at'];
        $checked = 0;

        foreach ($export['rows'] as $row) {
            foreach ($numeric as $column) {
                expect($row[$column])->not->toStartWith('-')->and($row[$column])->not->toStartWith("'");
                $checked++;
            }
        }

        expect($checked)->toBe(8 * count($numeric));
    });
});

describe('escaping', function () {
    it('prefixes text a spreadsheet would run as a formula', function (string $text) {
        exportable('run-a', ['name' => $text, 'prompt_excerpt' => $text, 'response_excerpt' => $text, 'user_id' => $text, 'user_type' => User::class]);
        exportable('run-b', ['name' => 'plain', 'prompt_excerpt' => 'safe', 'started_at' => '2026-01-02 09:00:00']);

        $rows = collect(exportAt($this)['rows'])->keyBy('id');

        expect($rows['run-a']['name'])->toBe("'".$text)
            ->and($rows['run-a']['prompt_excerpt'])->toBe("'".$text)
            ->and($rows['run-a']['response_excerpt'])->toBe("'".$text)
            ->and($rows['run-a']['user_id'])->toBe("'".$text)
            ->and($rows['run-b']['name'])->toBe('plain')
            ->and($rows['run-b']['prompt_excerpt'])->toBe('safe');
    })->with([
        'equals' => '=1+1', 'plus' => '+1', 'minus' => '-1', 'at' => '@SUM(A1)', 'tab' => "\tcell", 'carriage return' => "\rcell",
        'line feed' => "\ncell", 'space then equals' => ' =1+1', 'no-break space then at' => "\xC2\xA0@SUM(A1)", 'newline then minus' => "\r\n-1",
    ]);

    it('prefixes the id, the user\'s name and email, which also come from outside', function () {
        DB::table('users')->insert(['id' => 8, 'name' => '=HYPERLINK("http://x")', 'email' => '+a@example.test', 'password' => 'x']);
        exportable('=cmd|calc', ['user_id' => '8', 'user_type' => User::class]);
        exportable('run-b', ['started_at' => '2026-01-02 09:00:00']);

        $rows = collect(exportAt($this)['rows'])->keyBy('id');

        expect($rows)->toHaveKeys(["'=cmd|calc", 'run-b'])
            ->and($rows["'=cmd|calc"]['user_name'])->toBe("'=HYPERLINK(\"http://x\")")
            ->and($rows["'=cmd|calc"]['user_email'])->toBe("'+a@example.test")
            ->and($rows["'=cmd|calc"]['user_id'])->toBe('8')
            ->and($rows['run-b']['user_name'])->toBe('');
    });

    it('keeps quotes, commas, line breaks and backslashes through a round trip', function () {
        $texts = [
            'quote' => 'say "hi"',
            'comma' => 'a, b, c',
            'crlf' => "line one\r\nline two",
            'lf' => "line one\nline two",
            'backslash' => 'a\\"b',
            'trailing backslash' => 'path\\',
            'unicode' => 'Zoë 日本語 ✓ 🚀',
        ];

        $minutes = 0;

        foreach ($texts as $id => $text) {
            exportable($id, ['name' => $text, 'prompt_excerpt' => $text, 'started_at' => Carbon::parse('2026-01-02 10:00:00')->addMinutes($minutes++)]);
        }

        $rows = collect(exportAt($this)['rows'])->keyBy('id');

        expect($rows)->toHaveCount(count($texts));

        foreach ($texts as $id => $text) {
            expect($rows[$id]['name'])->toBe($text, $id)->and($rows[$id]['prompt_excerpt'])->toBe($text, $id);
        }
    });

    it('starts the file with one byte-order mark and ends every line with CRLF', function () {
        exportable('run-a', ['name' => "multi\nline", 'prompt_excerpt' => "multi\r\nline"]);
        exportable('run-b');

        $content = exportAt($this)['content'];

        expect(substr_count($content, TraceCsv::BYTE_ORDER_MARK))->toBe(1)
            ->and($content)->toEndWith("\r\n")
            ->and(preg_match_all('/(?<!\r)\n/', str_replace("\"multi\nline\"", '', $content)))->toBe(0);
    });
});

describe('the selection', function () {
    beforeEach(function () {
        foreach (['a', 'b', 'c', 'd'] as $position => $id) {
            exportable($id, ['started_at' => Carbon::parse('2026-01-02 10:00:00')->addMinutes($position), 'duration_ms' => 100 * ($position + 1)]);
        }

        exportable('old', ['started_at' => '2025-12-01 10:00:00']);
    });

    it('keeps only the runs asked for, in the list\'s order', function () {
        expect(exportedIds($this, 'ids=b,d,a'))->toBe(['d', 'b', 'a'])
            ->and(exportedIds($this, 'ids=b,d,a&sort=started_at'))->toBe(['a', 'b', 'd'])
            ->and(exportedIds($this, 'ids=b,d,a&sort=-duration'))->toBe(['d', 'b', 'a']);
    });

    it('still applies the range and the filters', function () {
        Rows::bookmark(Trace::findOrFail('b'));

        expect(exportedIds($this, 'ids=a,b,old,unknown'))->toBe(['b', 'a'])
            ->and(exportedIds($this, 'ids=a,b,c&bookmarked=1'))->toBe(['b'])
            ->and(exportedIds($this, 'ids=old,unknown'))->toBe([])
            ->and(exportedIds($this, 'ids=a,a,b'))->toBe(['b', 'a']);
    });

    it('treats an empty ids as none sent', function () {
        expect(exportedIds($this, 'ids='))->toBe(['d', 'c', 'b', 'a']);
    });

    it('counts the selection in the headers', function () {
        $response = $this->get('/trail/api/traces/export?ids=a,b,old');
        $response->streamedContent();

        $response->assertHeader('X-Trail-Export-Rows', '2')->assertHeader('X-Trail-Export-Total', '2');
    });

    it('accepts 100 ids and refuses 101, an impossible id, an empty one and a list', function () {
        $hundred = implode(',', array_map(fn (int $number) => "id-{$number}", range(1, 100)));

        expect(exportedIds($this, 'ids='.$hundred))->toBe([]);

        $this->get('/trail/api/traces/export?ids='.$hundred.',id-101')->assertUnprocessable()->assertJsonValidationErrors('ids');
        $this->get('/trail/api/traces/export?ids=a,'.str_repeat('x', 65))->assertUnprocessable()->assertJsonValidationErrors('ids');
        $this->get('/trail/api/traces/export?ids=a,%00')->assertUnprocessable()->assertJsonValidationErrors('ids');
        $this->get('/trail/api/traces/export?ids=a,%FF')->assertUnprocessable()->assertJsonValidationErrors('ids');
        $this->get('/trail/api/traces/export?ids=a,,b')->assertUnprocessable()->assertJsonValidationErrors('ids');
        $this->get('/trail/api/traces/export?ids[]=a')->assertUnprocessable()->assertJsonValidationErrors('ids');
    });

    it('is not a parameter of the list', function () {
        expect(idsAtList($this, 'ids=a'))->toBe(['d', 'c', 'b', 'a']);
    });
});

/**
 * @return list<string>
 */
function idsAtList(mixed $test, string $query): array
{
    return array_column($test->getJson('/trail/api/traces?'.$query)->assertOk()->json('data'), 'id');
}

/**
 * Many runs through the query builder, one per minute going back from the start of the range.
 */
function bulkRuns(int $count): void
{
    $now = Carbon::now()->format('Y-m-d H:i:s.v');
    $rows = [];

    for ($number = 1; $number <= $count; $number++) {
        $rows[] = [
            'id' => sprintf('bulk-%05d', $number), 'type' => 'agent', 'name' => 'Bulk', 'status' => 'completed',
            'user_id' => '7', 'user_type' => User::class,
            'started_at' => Carbon::parse('2026-01-02 11:59:00')->subSeconds($number)->format('Y-m-d H:i:s.v'),
            'created_at' => $now, 'updated_at' => $now,
        ];
    }

    foreach (array_chunk($rows, 100) as $batch) {
        DB::table('trail_traces')->insert($batch);
    }
}

/** The limit is a constructor argument of the query class, which a test replaces through the container. */
function limitExportsTo(int $limit): void
{
    app()->bind(TraceIndex::class, fn () => new TraceIndex($limit));
}

describe('the row limit', function () {
    it('writes the first runs of the list and says it cut the rest', function () {
        limitExportsTo(5);
        bulkRuns(12);

        $response = $this->get('/trail/api/traces/export?sort=started_at');
        $content = $response->streamedContent();

        $response->assertHeader('X-Trail-Export-Rows', '5')
            ->assertHeader('X-Trail-Export-Total', '12')
            ->assertHeader('X-Trail-Export-Truncated', 'true');

        $ids = array_column(exportAt($this, 'sort=started_at')['rows'], 'id');

        // Oldest first: the five oldest of twelve.
        expect($ids)->toBe(['bulk-00012', 'bulk-00011', 'bulk-00010', 'bulk-00009', 'bulk-00008'])
            ->and(substr_count($content, 'bulk-'))->toBe(5);
    });

    it('is not truncated at exactly the limit', function () {
        limitExportsTo(5);
        bulkRuns(5);

        $response = $this->get('/trail/api/traces/export');
        $response->streamedContent();

        $response->assertHeader('X-Trail-Export-Rows', '5')
            ->assertHeader('X-Trail-Export-Total', '5')
            ->assertHeader('X-Trail-Export-Truncated', 'false');

        expect(exportedIds($this))->toHaveCount(5);
    });

    it('is 10,000 by default', function () {
        expect(TraceIndex::EXPORT_LIMIT)->toBe(10000)->and(app(TraceIndex::class)->exportLimit())->toBe(10000);
    });

    it('reads in chunks, so the queries depend on the chunks and not on the runs', function () {
        DB::table('users')->insert(['id' => 7, 'name' => 'Ada', 'email' => 'ada@example.test', 'password' => 'x']);
        bulkRuns(1200);

        $count = function (string $query) {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $response = $this->get('/trail/api/traces/export'.$query);
            $content = $response->streamedContent();
            $queries = count(DB::getQueryLog());
            DB::disableQueryLog();

            return [$queries, substr_count($content, 'bulk-')];
        };

        [$all, $written] = $count('');
        [$one, $few] = $count('?ids=bulk-00001,bulk-00002');

        // One count, then for each chunk of 500 the runs, their bookmarks and their users.
        expect($written)->toBe(1200)
            ->and($all)->toBeLessThanOrEqual(1 + 3 * 3)
            ->and($few)->toBe(2)
            ->and($one)->toBeLessThanOrEqual(1 + 3)
            ->and($all)->toBeLessThan($written);
    });

    it('writes every run once across the chunk boundaries, in the order of the list', function () {
        bulkRuns(1200);

        $listed = [];

        foreach (range(1, 12) as $page) {
            $listed = [...$listed, ...idsAtList($this, "per_page=100&page={$page}")];
        }

        $exported = exportedIds($this);

        expect($listed)->toHaveCount(1200)
            ->and($exported)->toHaveCount(1200)
            ->and(array_unique($exported))->toHaveCount(1200)
            ->and($exported)->toBe($listed);
    });

    it('stops at a limit that is not a multiple of the chunk', function () {
        limitExportsTo(600);
        bulkRuns(700);

        $response = $this->get('/trail/api/traces/export');
        $response->streamedContent();

        $response->assertHeader('X-Trail-Export-Rows', '600')
            ->assertHeader('X-Trail-Export-Total', '700')
            ->assertHeader('X-Trail-Export-Truncated', 'true');

        $ids = exportedIds($this);
        $firstSix = [];

        foreach (range(1, 6) as $page) {
            $firstSix = [...$firstSix, ...idsAtList($this, "per_page=100&page={$page}")];
        }

        expect($ids)->toHaveCount(600)
            ->and(array_unique($ids))->toHaveCount(600)
            ->and($ids)->toBe($firstSix);
    });

    it('does not hide a failure after the file has started', function () {
        bulkRuns(1200);

        // The second read of the runs fails: the first chunk has been sent by then.
        $reads = 0;
        DB::listen(function ($query) use (&$reads) {
            if (str_contains($query->sql, 'trail_traces') && str_contains($query->sql, 'limit') && ++$reads === 2) {
                throw new RuntimeException('the database went away');
            }
        });

        // The status and headers were decided before the first byte, and the body is only started when it is read.
        $response = $this->get('/trail/api/traces/export');
        $response->assertOk()->assertHeader('X-Trail-Export-Rows', '1200');

        $written = '';
        $level = ob_get_level();

        try {
            $response->streamedContent();
        } catch (RuntimeException $exception) {
            $written = $exception->getMessage();
        } finally {
            // The test client buffers the body and does not close its buffer when the stream throws.
            while (ob_get_level() > $level) {
                ob_end_clean();
            }
        }

        // The exception reaches the caller; it is not turned into a short but clean-looking body.
        expect($written)->toBe('the database went away')
            ->and($reads)->toBe(2);
    });
});

describe('access', function () {
    it('answers 403 as JSON outside the local environment without a gate', function () {
        $this->app['env'] = 'production';

        $this->get('/trail/api/traces/export')->assertForbidden()->assertJsonStructure(['message']);
    });

    it('answers 404 as JSON when the dashboard is switched off', function () {
        config(['trail.dashboard.enabled' => false]);

        $this->get('/trail/api/traces/export')->assertNotFound()->assertJsonStructure(['message']);
    });

    it('answers a bad parameter with the 422 JSON and no CSV', function (string $query, string $field) {
        exportable('run-a');

        $response = $this->get('/trail/api/traces/export?'.$query);

        $response->assertUnprocessable()->assertJsonValidationErrors($field);
        expect($response->headers->get('Content-Type'))->toContain('application/json')
            ->and($response->headers->has('X-Trail-Export-Rows'))->toBeFalse()
            ->and($response->getContent())->not->toContain(TraceCsv::BYTE_ORDER_MARK);
    })->with([
        'a sort' => ['sort=nonsense', 'sort'],
        'a range' => ['range=2y', 'range'],
        'a status' => ['status=nonsense', 'status'],
        'a switch' => ['slow=maybe', 'slow'],
        'a user type alone' => ['user_type=x', 'user_id'],
        'ids' => ['ids='.str_repeat('x', 65), 'ids'],
    ]);

    it('sends a CSV attachment with the headers of a file', function () {
        exportable('run-a');

        $response = $this->get('/trail/api/traces/export');
        $response->streamedContent();

        expect($response->headers->get('Content-Type'))->toBe('text/csv; charset=UTF-8')
            ->and($response->headers->get('Content-Disposition'))->toBe('attachment; filename="trail-traces-20260102-120000.csv"')
            ->and($response->headers->get('Cache-Control'))->toContain('no-store')
            ->and($response->headers->get('X-Content-Type-Options'))->toBe('nosniff')
            ->and($response->headers->get('X-Accel-Buffering'))->toBe('no');
    });

    it('sends the file outside the local environment to a user the gate allows', function () {
        $this->app['env'] = 'production';
        Gate::define('viewTrail', fn ($user) => $user->email === 'ada@example.com');
        exportable('run-a');

        $this->get('/trail/api/traces/export')->assertForbidden();

        $response = $this->actingAs(new GenericUser(['id' => 1, 'email' => 'ada@example.com']))->get('/trail/api/traces/export');
        $content = $response->streamedContent();

        $response->assertOk();
        expect($response->headers->get('Content-Type'))->toBe('text/csv; charset=UTF-8')
            ->and($content)->toContain('run-a');

        $this->actingAs(new GenericUser(['id' => 2, 'email' => 'other@example.com']))->get('/trail/api/traces/export')->assertForbidden();

        // Rolling back this test's migrations asks for confirmation in production.
        $this->app['env'] = 'testing';
    });
});

describe('the route', function () {
    it('is not read as a run\'s id by the detail route', function () {
        exportable('run-a');

        $response = $this->get('/trail/api/traces/export');
        $content = $response->streamedContent();

        expect($response->headers->get('Content-Type'))->toBe('text/csv; charset=UTF-8')
            ->and($content)->toContain('run-a');
    });

    it('cannot open a run whose id is export through the detail route', function () {
        exportable('export');

        // The export answers instead, and the run is a row of it.
        expect(exportedIds($this))->toBe(['export']);
    });

    it('answers an empty view with the header row alone', function () {
        $export = exportAt($this);

        expect($export['rows'])->toBe([])
            ->and($export['content'])->toBe(TraceCsv::BYTE_ORDER_MARK.TraceCsv::header());

        $response = $this->get('/trail/api/traces/export');
        $response->streamedContent();

        $response->assertHeader('X-Trail-Export-Rows', '0')->assertHeader('X-Trail-Export-Total', '0')->assertHeader('X-Trail-Export-Truncated', 'false');
    });
});
