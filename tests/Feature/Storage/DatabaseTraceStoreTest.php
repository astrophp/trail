<?php

use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\Contracts\TraceStore;
use Astro\Trail\Storage\DatabaseTraceStore;
use Astro\Trail\Tests\Fixtures\Storage\Records;
use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Astro\Trail\Tests\Fixtures\Storage\Transactions;
use Illuminate\Database\Events\TransactionBeginning;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;

uses(RefreshDatabase::class);

it('resolves the database store as a singleton', function () {
    expect(app(TraceStore::class))->toBeInstanceOf(DatabaseTraceStore::class)
        ->and(app(TraceStore::class))->toBe(app(TraceStore::class));
});

it('writes on the configured storage connection', function () {
    config([
        'database.connections.trail_secondary' => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => ''],
        'trail.storage.connection' => 'trail_secondary',
    ]);

    foreach (['traces', 'spans'] as $table) {
        $migration = glob(dirname(__DIR__, 3)."/database/migrations/*_create_trail_{$table}_table.php")[0];
        (require $migration)->up();
    }

    app(TraceStore::class)->store(Records::trace(['id' => 'trace-1']), [Records::span('trace-1', ['id' => 'span-1'])]);

    expect(DB::connection('trail_secondary')->table('trail_traces')->count())->toBe(1)
        ->and(DB::connection('trail_secondary')->table('trail_spans')->count())->toBe(1)
        ->and(DB::table('trail_traces')->count())->toBe(0);
});

it('removes bookmarks of pruned traces and keeps the others', function () {
    $this->travelTo(Carbon::parse('2026-03-01 12:00:00'));
    $old = Rows::trace(['id' => 'old']);
    Rows::bookmark($old);

    DB::table('trail_traces')->where('id', 'old')->update(['created_at' => '2026-02-01 00:00:00.000']);

    $kept = Rows::trace(['id' => 'kept']);
    Rows::bookmark($kept);

    expect(app(TraceStore::class)->prune(Carbon::parse('2026-02-15 00:00:00')))->toBe(1)
        ->and(DB::table('trail_bookmarks')->pluck('trace_id')->all())->toBe(['kept']);
});

it('clears bookmarks and keeps prices', function () {
    $trace = Rows::trace();
    Rows::span($trace);
    Rows::bookmark($trace);
    Rows::price();

    app(TraceStore::class)->clear();

    expect(DB::table('trail_traces')->count())->toBe(0)
        ->and(DB::table('trail_spans')->count())->toBe(0)
        ->and(DB::table('trail_bookmarks')->count())->toBe(0)
        ->and(DB::table('trail_prices')->count())->toBe(1);
});

it('prunes more traces than one chunk', function () {
    $rows = [];

    for ($i = 0; $i < 1050; $i++) {
        $rows[] = [
            'id' => "trace-{$i}",
            'type' => 'agent',
            'name' => 'Agent',
            'status' => 'completed',
            'started_at' => '2026-01-01 00:00:00.000',
            'created_at' => '2026-01-01 00:00:00.000',
            'updated_at' => '2026-01-01 00:00:00.000',
        ];
    }

    foreach (array_chunk($rows, 100) as $chunk) {
        DB::table('trail_traces')->insert($chunk);
    }

    DB::table('trail_traces')->where('id', 'trace-0')->update(['created_at' => '2026-03-01 00:00:00.000']);

    expect(app(TraceStore::class)->prune(Carbon::parse('2026-02-01 00:00:00')))->toBe(1049)
        ->and(DB::table('trail_traces')->count())->toBe(1);
});

it('stores more spans than one insert chunk', function () {
    $spans = [];

    for ($i = 0; $i < 60; $i++) {
        $spans[] = Records::span('trace-1', ['id' => "span-{$i}", 'sequence' => $i, 'inputTokens' => 1]);
    }

    app(TraceStore::class)->store(Records::trace(['id' => 'trace-1']), $spans);

    expect(DB::table('trail_spans')->count())->toBe(60)
        ->and((int) DB::table('trail_traces')->value('span_count'))->toBe(60)
        ->and((int) DB::table('trail_traces')->value('input_tokens'))->toBe(60);
});

it('starts a new insert statement when the rows gathered are large, so none nears a server\'s packet limit', function () {
    $statements = [];
    DB::listen(function ($query) use (&$statements) {
        if (str_starts_with($query->sql, 'insert into "trail_spans"') || str_starts_with($query->sql, 'insert into `trail_spans`')) {
            $statements[] = array_sum(array_map(fn ($binding) => is_string($binding) ? strlen($binding) : 0, $query->bindings));
        }
    });

    $spans = [];

    // Eight spans of about 400 KB each, then one of about 2 MB: more than a statement may carry, and a row larger than the budget.
    for ($i = 0; $i < 8; $i++) {
        $spans[] = Records::span('trace-1', ['id' => "span-{$i}", 'sequence' => $i, 'input' => ['text' => str_repeat('x', 400_000)]]);
    }

    $spans[] = Records::span('trace-1', ['id' => 'span-big', 'sequence' => 8, 'input' => ['text' => str_repeat('y', 2_000_000)]]);
    $spans[] = Records::span('trace-1', ['id' => 'span-last', 'sequence' => 9]);

    app(TraceStore::class)->store(Records::trace(['id' => 'trace-1']), $spans);

    expect(DB::table('trail_spans')->count())->toBe(10)
        ->and(count($statements))->toBeGreaterThanOrEqual(4)
        // No statement carries more than the budget plus the one row that tipped it over, except a row that is larger alone.
        ->and(array_slice($statements, 0, -2))->each->toBeLessThanOrEqual(1_048_576 + 400_100)
        ->and(max($statements))->toBeLessThan(2_100_000);
});

it('survives invalid utf-8 and unencodable values in json columns', function () {
    $resource = fopen('php://memory', 'r');

    app(TraceStore::class)->store(
        Records::trace(['id' => 'trace-1', 'metadata' => ['ok' => 'fine', 'bad' => "broken \xB1\x31 text"]]),
        [Records::span('trace-1', [
            'id' => 'span-1',
            'input' => ['text' => "caf\xE9 ok", 'number' => NAN, 'nested' => ['inf' => -INF, 'fine' => 1.5]],
            'output' => ['kept' => 'yes', 'handle' => $resource],
            'metadata' => ['inf' => INF, 'name' => 'x'],
        ])],
    );

    if (is_resource($resource)) {
        fclose($resource);
    }

    $trace = json_decode((string) DB::table('trail_traces')->value('metadata'), true);
    $span = DB::table('trail_spans')->first();

    expect($trace['ok'])->toBe('fine')
        ->and($trace['bad'])->toStartWith('broken ')->toEndWith(' text')
        ->and(json_decode((string) $span?->input, true)['text'])->toStartWith('caf')->toEndWith(' ok')
        ->and(json_decode((string) $span?->output, true)['kept'])->toBe('yes')
        ->and(json_decode((string) $span?->metadata, true))->toBe(['inf' => null, 'name' => 'x'])
        ->and(json_decode((string) $span?->input, true)['number'])->toBeNull()
        ->and(json_decode((string) $span?->input, true)['nested'])->toBe(['inf' => null, 'fine' => 1.5]);
});

it('stores unicode unescaped and distinguishes empty arrays from null', function () {
    app(TraceStore::class)->store(
        Records::trace(['id' => 'trace-1', 'metadata' => []]),
        [
            Records::span('trace-1', ['id' => 'span-1', 'input' => ['text' => 'héllo 日本語 / path'], 'output' => [], 'metadata' => null]),
        ],
    );

    $trace = DB::table('trail_traces')->first();
    $span = DB::table('trail_spans')->first();

    expect($trace?->metadata)->toBe('[]')
        ->and($span?->input)->toBe('{"text":"héllo 日本語 / path"}')
        ->and($span?->output)->toBe('[]')
        ->and($span?->metadata)->toBeNull();
});

it('strips NUL bytes and scrubs invalid utf-8 from string columns', function () {
    app(TraceStore::class)->store(
        Records::trace([
            'id' => 'trace-1',
            'name' => "na\0me \xFF",
            'agentClass' => "App\\Agent\0",
            'errorMessage' => "boom\0 \xC3\x28 end",
            'promptExcerpt' => "prompt\0",
        ]),
        [Records::span('trace-1', ['id' => 'span-1', 'name' => "step\0", 'errorMessage' => "bad \xFF"])],
    );

    $trace = DB::table('trail_traces')->first();
    $span = DB::table('trail_spans')->first();

    expect($trace?->name)->toStartWith('name ')->not->toContain("\0")
        ->and($trace?->agent_class)->toBe('App\\Agent')
        ->and($trace?->error_message)->toStartWith('boom ')->toEndWith(' end')->not->toContain("\0")
        ->and(mb_check_encoding((string) $trace?->error_message, 'UTF-8'))->toBeTrue()
        ->and($trace?->prompt_excerpt)->toBe('prompt')
        ->and($span?->name)->toBe('step')
        ->and(mb_check_encoding((string) $span?->error_message, 'UTF-8'))->toBeTrue();
});

it('clamps varchar columns to 255 characters without splitting multibyte characters', function () {
    app(TraceStore::class)->store(
        Records::trace(['id' => 'trace-1', 'name' => str_repeat('日', 300), 'model' => str_repeat('m', 300), 'errorMessage' => str_repeat('e', 300)]),
        [Records::span('trace-1', ['id' => 'span-1', 'name' => str_repeat('é', 300), 'respondingModel' => str_repeat('r', 300)])],
    );

    $trace = DB::table('trail_traces')->first();
    $span = DB::table('trail_spans')->first();

    expect(mb_strlen((string) $trace?->name))->toBe(255)
        ->and(mb_check_encoding((string) $trace?->name, 'UTF-8'))->toBeTrue()
        ->and(mb_strlen((string) $trace?->model))->toBe(255)
        ->and(mb_strlen((string) $trace?->error_message))->toBe(300)
        ->and(mb_strlen((string) $span?->name))->toBe(255)
        ->and(mb_strlen((string) $span?->responding_model))->toBe(255);
});

it('rejects over-long ids and writes nothing', function (Closure $make) {
    expect(fn () => app(TraceStore::class)->store(...$make()))->toThrow(InvalidArgumentException::class);

    expect(DB::table('trail_traces')->count())->toBe(0)
        ->and(DB::table('trail_spans')->count())->toBe(0);
})->with([
    'trace id' => [fn () => [Records::trace(['id' => str_repeat('a', 65)]), []]],
    'span id' => [fn () => [Records::trace(['id' => 'trace-1']), [Records::span('trace-1', ['id' => str_repeat('a', 65)])]]],
    'parent id' => [fn () => [Records::trace(['id' => 'trace-1']), [Records::span('trace-1', ['parentId' => str_repeat('a', 65)])]]],
]);

it('keeps a valid http status and nulls an invalid one', function (int $status, ?int $expected) {
    app(TraceStore::class)->store(
        Records::trace(['id' => 'trace-1', 'errorHttpStatus' => $status]),
        [Records::span('trace-1', ['id' => 'span-1', 'errorHttpStatus' => $status])],
    );

    expect(DB::table('trail_traces')->value('error_http_status'))->toEqual($expected)
        ->and(DB::table('trail_spans')->value('error_http_status'))->toEqual($expected);
})->with([
    [429, 429],
    [100, 100],
    [599, 599],
    [0, null],
    [99, null],
    [600, null],
    [70000, null],
]);

it('writes datetimes with milliseconds', function () {
    $this->travelTo(Carbon::parse('2026-03-01 12:00:00.123456'));

    app(TraceStore::class)->store(
        Records::trace(['id' => 'trace-1', 'startedAt' => Carbon::parse('2026-03-01 11:59:59.987')]),
        [Records::span('trace-1', ['id' => 'span-1', 'startedAt' => Carbon::parse('2026-03-01 11:59:59.987')])],
    );

    foreach (['trail_traces', 'trail_spans'] as $table) {
        $row = DB::table($table)->first();

        expect((string) $row?->created_at)->toEndWith('.123')
            ->and((string) $row?->started_at)->toEndWith('.987');
    }
});

it('stores a whole call atomically', function () {
    $store = app(TraceStore::class);
    $store->store(Records::trace(['id' => 'trace-1', 'name' => 'Before']), [Records::span('trace-1', ['id' => 'existing', 'name' => 'Before'])]);

    $trace = Records::trace(['id' => 'trace-1', 'name' => 'After', 'status' => Status::Completed]);

    expect(fn () => $store->store($trace, [
        Records::span('trace-1', ['id' => 'existing', 'name' => 'After']),
        Records::span('trace-1', ['id' => 'duplicate', 'type' => SpanType::Tool]),
        Records::span('trace-1', ['id' => 'duplicate', 'type' => SpanType::Tool]),
    ]))->toThrow(QueryException::class);

    expect(DB::table('trail_traces')->value('name'))->toBe('Before')
        ->and(DB::table('trail_traces')->value('status'))->toBe('running')
        ->and(DB::table('trail_spans')->pluck('name', 'id')->all())->toBe(['existing' => 'Before']);

    $store->store($trace, [Records::span('trace-1', ['id' => 'later'])]);

    expect(DB::table('trail_traces')->value('name'))->toBe('After')
        ->and(DB::table('trail_spans')->count())->toBe(2);
});

it('writes a brand new trace atomically', function () {
    expect(fn () => app(TraceStore::class)->store(Records::trace(['id' => 'trace-1']), [
        Records::span('trace-1', ['id' => 'duplicate']),
        Records::span('trace-1', ['id' => 'duplicate']),
    ]))->toThrow(QueryException::class);

    expect(DB::table('trail_traces')->count())->toBe(0)
        ->and(DB::table('trail_spans')->count())->toBe(0);
});

it('does not fail or change anything when starting a trace that already exists', function () {
    $trace = Rows::trace(['id' => 'trace-1', 'name' => 'Existing', 'status' => Status::Completed]);
    $before = (array) DB::table('trail_traces')->where('id', $trace->id)->first();

    app(TraceStore::class)->start(Records::trace(['id' => 'trace-1', 'name' => 'Started']));

    expect((array) DB::table('trail_traces')->where('id', 'trace-1')->first())->toBe($before)
        ->and(DB::table('trail_traces')->count())->toBe(1);
});

it('starts a trace with a plain insert when no transaction is open', function () {
    Transactions::outside(function () {
        $began = 0;
        Event::listen(TransactionBeginning::class, function () use (&$began) {
            $began++;
        });

        app(TraceStore::class)->start(Records::trace(['id' => 'trace-1', 'name' => 'Started']));

        expect($began)->toBe(0)
            ->and(DB::table('trail_traces')->where('id', 'trace-1')->value('name'))->toBe('Started')
            ->and(DB::connection()->transactionLevel())->toBe(0);
    });
});

it('does not throw or overwrite when a second start finds the trace with no transaction open', function () {
    Transactions::outside(function () {
        app(TraceStore::class)->start(Records::trace(['id' => 'trace-1', 'name' => 'First']));
        app(TraceStore::class)->start(Records::trace(['id' => 'trace-1', 'name' => 'Second']));

        expect(DB::table('trail_traces')->count())->toBe(1)
            ->and(DB::table('trail_traces')->value('name'))->toBe('First');
    });
});

it('keeps the application transaction usable when a start inside it finds a duplicate', function () {
    DB::transaction(function () {
        app(TraceStore::class)->start(Records::trace(['id' => 'trace-1', 'name' => 'First']));
        app(TraceStore::class)->start(Records::trace(['id' => 'trace-1', 'name' => 'Second']));

        // On Postgres a failed statement aborts the transaction unless it ran in a savepoint.
        expect(DB::table('trail_traces')->count())->toBe(1)
            ->and(DB::table('trail_traces')->value('name'))->toBe('First');
    });
});

it('updates a trace row that was inserted by someone else', function () {
    Rows::trace(['id' => 'trace-1', 'name' => 'Existing']);

    app(TraceStore::class)->store(
        Records::trace(['id' => 'trace-1', 'name' => 'Updated']),
        [Records::span('trace-1', ['id' => 'span-1', 'inputTokens' => 3])],
    );

    expect(DB::table('trail_traces')->count())->toBe(1)
        ->and(DB::table('trail_traces')->value('name'))->toBe('Updated')
        ->and((int) DB::table('trail_traces')->value('input_tokens'))->toBe(3);
});

it('keeps stored values in range', function (array $span, array $expected) {
    app(TraceStore::class)->store(
        Records::trace(['id' => 'trace-1', 'promptExcerpt' => str_repeat('p', 10050), 'responseExcerpt' => str_repeat('é', 10050)]),
        [Records::span('trace-1', array_merge(['id' => 'span-1'], $span))],
    );

    $row = (array) DB::table('trail_spans')->first();
    $actual = [];

    foreach ($expected as $column => $value) {
        $actual[$column] = $row[$column] === null ? null : (is_numeric($row[$column]) ? $row[$column] + 0 : $row[$column]);
    }

    expect($actual)->toEqual($expected)
        ->and(mb_strlen((string) DB::table('trail_traces')->value('prompt_excerpt')))->toBe(10000)
        ->and(mb_strlen((string) DB::table('trail_traces')->value('response_excerpt')))->toBe(10000);
})->with([
    'negative tokens' => [['inputTokens' => -1, 'outputTokens' => -5, 'reasoningTokens' => 0], ['input_tokens' => null, 'output_tokens' => null, 'reasoning_tokens' => 0]],
    'attempt too low' => [['attempt' => 0], ['attempt' => 1]],
    'attempt too high' => [['attempt' => 99999], ['attempt' => 32767]],
    'sequence and step below range' => [['sequence' => -4, 'stepNumber' => -2], ['sequence' => 0, 'step_number' => 0]],
    'sequence and step above range' => [['sequence' => 3000000000, 'stepNumber' => 3000000000], ['sequence' => 2147483647, 'step_number' => 2147483647]],
    'valid values kept' => [['attempt' => 3, 'sequence' => 7, 'stepNumber' => 2, 'cost' => 99999999.5], ['attempt' => 3, 'sequence' => 7, 'step_number' => 2, 'cost' => 99999999.5]],
    'negative cost' => [['inputTokens' => 1, 'cost' => -0.5], ['cost' => null]],
    'cost too large' => [['inputTokens' => 1, 'cost' => 100000000.0], ['cost' => null]],
]);

it('survives losing the race to another first writer', function () {
    $raced = false;

    // Fires after the store has read that no row exists and before it inserts.
    DB::listen(function ($query) use (&$raced) {
        if ($raced || ! str_starts_with($query->sql, 'select') || ! str_contains($query->sql, 'trail_traces')) {
            return;
        }

        $raced = true;
        Rows::trace(['id' => 'trace-1', 'name' => 'Rival', 'status' => Status::Running]);
    });

    app(TraceStore::class)->store(
        Records::trace(['id' => 'trace-1', 'name' => 'Mine', 'status' => Status::Failed]),
        [Records::span('trace-1', ['id' => 'span-1'])],
    );

    expect($raced)->toBeTrue()
        ->and(DB::table('trail_traces')->count())->toBe(1)
        ->and(DB::table('trail_traces')->value('name'))->toBe('Mine')
        ->and(DB::table('trail_traces')->value('status'))->toBe('failed')
        ->and(DB::table('trail_spans')->count())->toBe(1);
});
