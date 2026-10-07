<?php

use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\Contracts\TraceStore;
use Astro\Trail\Storage\DatabaseTraceStore;
use Astro\Trail\Tests\Fixtures\Storage\Records;
use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

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

it('survives invalid utf-8 and unencodable values in json columns', function () {
    $resource = fopen('php://memory', 'r');

    app(TraceStore::class)->store(
        Records::trace(['id' => 'trace-1', 'metadata' => ['ok' => 'fine', 'bad' => "broken \xB1\x31 text"]]),
        [Records::span('trace-1', [
            'id' => 'span-1',
            'input' => ['text' => "caf\xE9 ok", 'number' => NAN],
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
        ->and(json_decode((string) $span?->metadata, true)['name'])->toBe('x');
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
