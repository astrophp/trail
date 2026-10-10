<?php

use Astro\Trail\Enums\ErrorSource;
use Astro\Trail\Enums\IssueKind;
use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\ArrayTraceStore;
use Astro\Trail\Storage\Contracts\TraceStore;
use Astro\Trail\Storage\DatabaseTraceStore;
use Astro\Trail\Tests\Fixtures\Storage\ArrayStoreProbe;
use Astro\Trail\Tests\Fixtures\Storage\DatabaseStoreProbe;
use Astro\Trail\Tests\Fixtures\Storage\Records;
use Illuminate\Database\ConnectionResolverInterface;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;

uses(RefreshDatabase::class);

dataset('stores', [
    'database' => [fn () => [new DatabaseTraceStore(app(ConnectionResolverInterface::class)), new DatabaseStoreProbe]],
    'array' => [function () {
        $store = new ArrayTraceStore;

        return [$store, new ArrayStoreProbe($store)];
    }],
]);

dataset('totals', [
    'no spans' => [
        [],
        ['input_tokens' => null, 'output_tokens' => null, 'cache_read_tokens' => null, 'cache_write_tokens' => null, 'reasoning_tokens' => null, 'cost' => null, 'span_count' => 0, 'unpriced_span_count' => 0],
    ],
    'agent and tool spans never contribute' => [
        [
            ['type' => SpanType::Agent, 'inputTokens' => 100, 'outputTokens' => 50, 'cost' => 1.5],
            ['type' => SpanType::Tool, 'inputTokens' => 7, 'cacheReadTokens' => 3, 'cost' => 0.25],
        ],
        ['input_tokens' => null, 'output_tokens' => null, 'cache_read_tokens' => null, 'cache_write_tokens' => null, 'reasoning_tokens' => null, 'cost' => null, 'span_count' => 2, 'unpriced_span_count' => 0],
    ],
    'partially reported usage sums per column' => [
        [
            ['inputTokens' => 10, 'outputTokens' => 5, 'cost' => 0.5],
            ['inputTokens' => 7, 'cacheReadTokens' => 3, 'cost' => 0.25],
        ],
        ['input_tokens' => 17, 'output_tokens' => 5, 'cache_read_tokens' => 3, 'cache_write_tokens' => null, 'reasoning_tokens' => null, 'cost' => 0.75, 'span_count' => 2, 'unpriced_span_count' => 0],
    ],
    'a reported zero stays zero' => [
        [
            ['inputTokens' => 0, 'cost' => 0.0],
            ['inputTokens' => null, 'cost' => null],
        ],
        ['input_tokens' => 0, 'output_tokens' => null, 'cache_read_tokens' => null, 'cache_write_tokens' => null, 'reasoning_tokens' => null, 'cost' => 0.0, 'span_count' => 2, 'unpriced_span_count' => 0],
    ],
    'priced and unpriced steps' => [
        [
            ['inputTokens' => 10, 'cost' => 0.5],
            ['inputTokens' => 5],
            ['reasoningTokens' => 2],
        ],
        ['input_tokens' => 15, 'output_tokens' => null, 'cache_read_tokens' => null, 'cache_write_tokens' => null, 'reasoning_tokens' => 2, 'cost' => 0.5, 'span_count' => 3, 'unpriced_span_count' => 2],
    ],
    'a failed step without usage is not unpriced' => [
        [
            ['status' => Status::Failed, 'errorClass' => 'RuntimeException'],
            ['status' => Status::Running],
        ],
        ['input_tokens' => null, 'output_tokens' => null, 'cache_read_tokens' => null, 'cache_write_tokens' => null, 'reasoning_tokens' => null, 'cost' => null, 'span_count' => 2, 'unpriced_span_count' => 0],
    ],
    'embeddings count like steps' => [
        [
            ['type' => SpanType::Embedding, 'inputTokens' => 4, 'cost' => 0.1],
            ['inputTokens' => 6, 'cost' => 0.2],
            ['type' => SpanType::Embedding, 'inputTokens' => 3],
        ],
        ['input_tokens' => 13, 'output_tokens' => null, 'cache_read_tokens' => null, 'cache_write_tokens' => null, 'reasoning_tokens' => null, 'cost' => 0.3, 'span_count' => 3, 'unpriced_span_count' => 1],
    ],
    'all unpriced leaves cost null' => [
        [
            ['inputTokens' => 4, 'outputTokens' => 1],
            ['inputTokens' => 6],
        ],
        ['input_tokens' => 10, 'output_tokens' => 1, 'cache_read_tokens' => null, 'cache_write_tokens' => null, 'reasoning_tokens' => null, 'cost' => null, 'span_count' => 2, 'unpriced_span_count' => 2],
    ],
    'small costs sum accurately' => [
        [
            ['inputTokens' => 1, 'cost' => 0.0000000125],
            ['inputTokens' => 1, 'cost' => 0.0000000125],
            ['inputTokens' => 1, 'cost' => 0.0000000125],
        ],
        ['input_tokens' => 3, 'output_tokens' => null, 'cache_read_tokens' => null, 'cache_write_tokens' => null, 'reasoning_tokens' => null, 'cost' => 0.0000000375, 'span_count' => 3, 'unpriced_span_count' => 0],
    ],
]);

it('starts a trace and updates the same row when it is stored', function (array $pair) {
    [$store, $probe] = $pair;

    $this->travelTo(Carbon::parse('2026-03-01 10:00:00.250'));
    $trace = Records::trace(['id' => 'trace-1']);
    $store->start($trace);

    expect($probe->traceCount())->toBe(1)
        ->and($probe->trace('trace-1'))->toMatchArray([
            'id' => 'trace-1',
            'type' => 'agent',
            'name' => 'Support agent',
            'status' => 'running',
            'input_tokens' => null,
            'output_tokens' => null,
            'cache_read_tokens' => null,
            'cache_write_tokens' => null,
            'reasoning_tokens' => null,
            'cost' => null,
            'span_count' => 0,
            'unpriced_span_count' => 0,
            'ended_at' => null,
            'created_at' => '2026-03-01 10:00:00.250',
            'updated_at' => '2026-03-01 10:00:00.250',
        ]);

    $this->travelTo(Carbon::parse('2026-03-01 10:05:00.750'));
    $store->store(
        Records::trace([
            'id' => 'trace-1',
            'status' => Status::Completed,
            'durationMs' => 300000.5,
            'endedAt' => Carbon::parse('2026-03-01 10:05:00.500'),
        ]),
        [Records::span('trace-1', ['id' => 'span-1', 'inputTokens' => 12, 'outputTokens' => 3, 'cost' => 0.002])],
    );

    expect($probe->traceCount())->toBe(1)
        ->and($probe->trace('trace-1'))->toMatchArray([
            'status' => 'completed',
            'duration_ms' => 300000.5,
            'ended_at' => '2026-03-01 10:05:00.500',
            'input_tokens' => 12,
            'output_tokens' => 3,
            'cost' => 0.002,
            'span_count' => 1,
            'unpriced_span_count' => 0,
            'created_at' => '2026-03-01 10:00:00.250',
            'updated_at' => '2026-03-01 10:05:00.750',
        ]);
})->with('stores');

it('stores a trace and its spans without a prior start', function (array $pair) {
    [$store, $probe] = $pair;

    $store->store(
        Records::trace(['id' => 'trace-1', 'status' => Status::Completed]),
        [
            Records::span('trace-1', ['id' => 'span-a', 'sequence' => 0, 'name' => 'first']),
            Records::span('trace-1', ['id' => 'span-b', 'sequence' => 1, 'name' => 'second', 'parentId' => 'span-a']),
        ],
    );

    expect($probe->traceCount())->toBe(1)
        ->and($probe->trace('trace-1'))->toMatchArray(['status' => 'completed', 'span_count' => 2])
        ->and(array_column($probe->spans('trace-1'), 'name'))->toBe(['first', 'second'])
        ->and($probe->spans('trace-1')[1]['parent_id'])->toBe('span-a');
})->with('stores');

it('does nothing when a trace that is already stored is started again', function (array $pair, Status $stored) {
    [$store, $probe] = $pair;

    $this->travelTo(Carbon::parse('2026-03-01 10:00:00'));
    $store->store(Records::trace(['id' => 'trace-1', 'status' => $stored, 'name' => 'Stored']), []);
    $before = $probe->trace('trace-1');

    $this->travelTo(Carbon::parse('2026-03-01 10:30:00'));
    $store->start(Records::trace(['id' => 'trace-1', 'name' => 'Started again']));

    expect($probe->traceCount())->toBe(1)
        ->and($probe->trace('trace-1'))->toBe($before);
})->with('stores')->with([Status::Running, Status::Completed, Status::Failed]);

it('ignores a late running write to a final trace and span', function (array $pair) {
    [$store, $probe] = $pair;

    $this->travelTo(Carbon::parse('2026-03-01 10:00:00'));
    $store->store(
        Records::trace(['id' => 'trace-1', 'status' => Status::Completed, 'name' => 'Final', 'endedAt' => Carbon::parse('2026-03-01 10:00:00')]),
        [Records::span('trace-1', ['id' => 'span-1', 'name' => 'Final step', 'inputTokens' => 10, 'sequence' => 0])],
    );
    $trace = $probe->trace('trace-1');
    $span = $probe->spans('trace-1')[0];

    $this->travelTo(Carbon::parse('2026-03-01 10:10:00'));

    $store->store(
        Records::trace([
            'id' => 'trace-1',
            'status' => Status::Running,
            'name' => 'Late',
            'errorClass' => 'LateError',
            'errorMessage' => 'late',
            'issueKind' => IssueKind::Exception,
            'errorSource' => ErrorSource::Run,
        ]),
        [
            Records::span('trace-1', ['id' => 'span-1', 'status' => Status::Running, 'name' => 'Late step', 'inputTokens' => 999, 'sequence' => 0]),
            Records::span('trace-1', ['id' => 'span-2', 'status' => Status::Running, 'name' => 'New step', 'inputTokens' => 5, 'sequence' => 1]),
        ],
    );

    $spans = $probe->spans('trace-1');

    expect($probe->trace('trace-1'))->toBe(array_merge($trace ?? [], [
        'input_tokens' => 15,
        'span_count' => 2,
        'unpriced_span_count' => 2,
        'updated_at' => '2026-03-01 10:10:00.000',
    ]))
        ->and($probe->trace('trace-1')['status'] ?? null)->toBe('completed')
        ->and($spans)->toHaveCount(2)
        ->and($spans[0])->toBe($span)
        ->and($spans[0]['updated_at'])->toBe('2026-03-01 10:00:00.000')
        ->and($spans[1])->toMatchArray(['id' => 'span-2', 'status' => 'running', 'name' => 'New step', 'updated_at' => '2026-03-01 10:10:00.000']);
})->with('stores');

it('lets a final status overwrite another final status', function (array $pair, Status $first, Status $second) {
    [$store, $probe] = $pair;

    $store->store(Records::trace(['id' => 'trace-1', 'status' => $first, 'name' => 'First']), [
        Records::span('trace-1', ['id' => 'span-1', 'status' => $first, 'name' => 'First']),
    ]);
    $store->store(Records::trace(['id' => 'trace-1', 'status' => $second, 'name' => 'Second']), [
        Records::span('trace-1', ['id' => 'span-1', 'status' => $second, 'name' => 'Second']),
    ]);

    expect($probe->trace('trace-1'))->toMatchArray(['status' => $second->value, 'name' => 'Second'])
        ->and($probe->spans('trace-1'))->toHaveCount(1)
        ->and($probe->spans('trace-1')[0])->toMatchArray(['status' => $second->value, 'name' => 'Second']);
})->with('stores')->with([
    'incomplete to completed' => [Status::Incomplete, Status::Completed],
    'completed to failed' => [Status::Completed, Status::Failed],
    'awaiting approval to completed' => [Status::AwaitingApproval, Status::Completed],
]);

it('updates an open trace on every running write', function (array $pair) {
    [$store, $probe] = $pair;

    $store->store(Records::trace(['id' => 'trace-1', 'name' => 'Open']), [
        Records::span('trace-1', ['id' => 'span-1', 'status' => Status::Running, 'name' => 'Step']),
    ]);
    $store->store(Records::trace(['id' => 'trace-1', 'name' => 'Still open', 'promptExcerpt' => 'Hello', 'metadata' => ['flush' => 2]]), [
        Records::span('trace-1', ['id' => 'span-1', 'status' => Status::Running, 'name' => 'Step', 'inputTokens' => 4]),
    ]);

    expect($probe->trace('trace-1'))->toMatchArray([
        'status' => 'running',
        'name' => 'Still open',
        'prompt_excerpt' => 'Hello',
        'metadata' => ['flush' => 2],
        'input_tokens' => 4,
        'span_count' => 1,
        'unpriced_span_count' => 1,
    ])->and($probe->spans('trace-1')[0])->toMatchArray(['status' => 'running', 'input_tokens' => 4]);
})->with('stores');

it('stores the same spans twice without duplicating them and adds only new spans', function (array $pair) {
    [$store, $probe] = $pair;

    $trace = Records::trace(['id' => 'trace-1']);
    $first = [
        Records::span('trace-1', ['id' => 'span-a', 'sequence' => 0, 'inputTokens' => 1, 'cost' => 0.1]),
        Records::span('trace-1', ['id' => 'span-b', 'sequence' => 1, 'inputTokens' => 2, 'cost' => 0.2]),
    ];

    $store->store($trace, $first);
    $store->store($trace, $first);

    expect($probe->spanCount())->toBe(2)
        ->and($probe->trace('trace-1'))->toMatchArray(['span_count' => 2, 'input_tokens' => 3, 'cost' => 0.3]);

    $store->store($trace, [...$first, Records::span('trace-1', ['id' => 'span-c', 'sequence' => 2, 'inputTokens' => 4, 'cost' => 0.4])]);

    expect($probe->spanCount())->toBe(3)
        ->and(array_column($probe->spans('trace-1'), 'id'))->toBe(['span-a', 'span-b', 'span-c']);

    $store->store($trace, [Records::span('trace-1', ['id' => 'span-d', 'sequence' => 3, 'inputTokens' => 8, 'cost' => 0.8])]);

    expect($probe->spanCount())->toBe(4)
        ->and($probe->trace('trace-1'))->toMatchArray(['span_count' => 4, 'input_tokens' => 15, 'cost' => 1.5]);
})->with('stores');

it('computes trace totals from the stored spans', function (array $pair, array $spans, array $expected) {
    [$store, $probe] = $pair;

    $records = [];

    foreach ($spans as $index => $attributes) {
        $records[] = Records::span('trace-1', array_merge(['id' => "span-{$index}", 'sequence' => $index], $attributes));
    }

    $store->store(Records::trace(['id' => 'trace-1', 'status' => Status::Completed]), $records);

    $row = $probe->trace('trace-1') ?? [];

    expect(array_intersect_key($row, $expected))->toBe($expected);
})->with('stores')->with('totals');

it('rejects a span that belongs to another trace and writes nothing', function (array $pair) {
    [$store, $probe] = $pair;

    expect(fn () => $store->store(Records::trace(['id' => 'trace-1']), [
        Records::span('trace-1', ['id' => 'span-1']),
        Records::span('trace-2', ['id' => 'span-2']),
    ]))->toThrow(InvalidArgumentException::class);

    expect($probe->traceCount())->toBe(0)
        ->and($probe->spanCount())->toBe(0);
})->with('stores');

it('sweeps abandoned running traces and spans', function (array $pair) {
    [$store, $probe] = $pair;

    $now = Carbon::parse('2026-03-01 12:00:00');

    $this->travelTo($now->copy()->subSeconds(120));
    $store->store(Records::trace(['id' => 'old-running']), [Records::span('old-running', ['id' => 'old-running-span', 'status' => Status::Running])]);
    $store->store(Records::trace(['id' => 'old-completed', 'status' => Status::Completed]), [Records::span('old-completed', ['id' => 'old-completed-span'])]);
    $store->store(Records::trace(['id' => 'old-failed', 'status' => Status::Failed]), [Records::span('old-failed', ['id' => 'old-failed-span', 'status' => Status::Failed])]);
    $store->store(Records::trace(['id' => 'old-awaiting', 'status' => Status::AwaitingApproval]), [Records::span('old-awaiting', ['id' => 'old-awaiting-span', 'status' => Status::AwaitingApproval])]);
    $store->store(Records::trace(['id' => 'old-mixed', 'status' => Status::Completed]), [Records::span('old-mixed', ['id' => 'old-mixed-span', 'status' => Status::Running])]);

    $this->travelTo($now->copy()->subSeconds(30));
    $store->store(Records::trace(['id' => 'young-running']), [Records::span('young-running', ['id' => 'young-running-span', 'status' => Status::Running])]);

    $this->travelTo($now);

    expect($store->sweep(60))->toBe(1);

    expect($probe->trace('old-running'))->toMatchArray([
        'status' => 'incomplete',
        'issue_kind' => 'abandoned',
        'ended_at' => null,
        'duration_ms' => null,
        'updated_at' => '2026-03-01 12:00:00.000',
    ])->and($probe->spans('old-running')[0])->toMatchArray([
        'status' => 'incomplete',
        'issue_kind' => 'abandoned',
        'ended_at' => null,
        'duration_ms' => null,
    ])->and($probe->trace('young-running'))->toMatchArray(['status' => 'running', 'issue_kind' => null])
        ->and($probe->spans('young-running')[0])->toMatchArray(['status' => 'running', 'issue_kind' => null])
        ->and($probe->trace('old-completed'))->toMatchArray(['status' => 'completed', 'issue_kind' => null])
        ->and($probe->spans('old-completed')[0]['status'])->toBe('completed')
        ->and($probe->trace('old-failed')['status'] ?? null)->toBe('failed')
        ->and($probe->spans('old-failed')[0]['status'])->toBe('failed')
        ->and($probe->trace('old-awaiting')['status'] ?? null)->toBe('awaiting_approval')
        ->and($probe->spans('old-awaiting')[0]['status'])->toBe('awaiting_approval')
        ->and($probe->trace('old-mixed'))->toMatchArray(['status' => 'completed', 'issue_kind' => null])
        ->and($probe->spans('old-mixed')[0])->toMatchArray(['status' => 'incomplete', 'issue_kind' => 'abandoned']);
})->with('stores');

it('never sweeps sooner than the minimum timeout', function (array $pair, int $requested) {
    [$store, $probe] = $pair;

    $now = Carbon::parse('2026-03-01 12:00:00');

    $this->travelTo($now->copy()->subSeconds(61));
    $store->store(Records::trace(['id' => 'older']), []);

    $this->travelTo($now->copy()->subSeconds(30));
    $store->store(Records::trace(['id' => 'younger']), []);

    $this->travelTo($now);

    expect($store->sweep($requested))->toBe(1)
        ->and($probe->trace('older')['status'] ?? null)->toBe('incomplete')
        ->and($probe->trace('younger')['status'] ?? null)->toBe('running');
})->with('stores')->with([0, 10, TraceStore::MINIMUM_STALE_SECONDS]);

it('honours a longer sweep timeout', function (array $pair) {
    [$store, $probe] = $pair;

    $now = Carbon::parse('2026-03-01 12:00:00');

    $this->travelTo($now->copy()->subSeconds(200));
    $store->store(Records::trace(['id' => 'older']), []);

    $this->travelTo($now->copy()->subSeconds(100));
    $store->store(Records::trace(['id' => 'younger']), []);

    $this->travelTo($now);

    expect($store->sweep(150))->toBe(1)
        ->and($probe->trace('older')['status'] ?? null)->toBe('incomplete')
        ->and($probe->trace('younger')['status'] ?? null)->toBe('running');
})->with('stores');

it('keeps a swept trace incomplete against later running writes until it completes', function (array $pair) {
    [$store, $probe] = $pair;

    $this->travelTo(Carbon::parse('2026-03-01 12:00:00'));
    $store->store(Records::trace(['id' => 'trace-1']), [Records::span('trace-1', ['id' => 'span-1', 'status' => Status::Running])]);

    $this->travelTo(Carbon::parse('2026-03-01 12:10:00'));
    expect($store->sweep(60))->toBe(1);

    $store->store(Records::trace(['id' => 'trace-1', 'name' => 'Renamed']), [Records::span('trace-1', ['id' => 'span-1', 'status' => Status::Running, 'name' => 'Renamed'])]);

    expect($probe->trace('trace-1'))->toMatchArray(['status' => 'incomplete', 'issue_kind' => 'abandoned', 'name' => 'Support agent'])
        ->and($probe->spans('trace-1')[0])->toMatchArray(['status' => 'incomplete', 'issue_kind' => 'abandoned', 'name' => 'step']);

    $store->store(Records::trace(['id' => 'trace-1', 'status' => Status::Completed]), [Records::span('trace-1', ['id' => 'span-1', 'status' => Status::Completed])]);

    expect($probe->trace('trace-1'))->toMatchArray(['status' => 'completed', 'issue_kind' => null])
        ->and($probe->spans('trace-1')[0])->toMatchArray(['status' => 'completed', 'issue_kind' => null]);

    $store->store(Records::trace(['id' => 'trace-1', 'status' => Status::Failed, 'issueKind' => IssueKind::Exception]), []);

    expect($probe->trace('trace-1'))->toMatchArray(['status' => 'failed', 'issue_kind' => 'exception']);
})->with('stores');

it('prunes traces first stored before the cutoff, with their spans', function (array $pair) {
    [$store, $probe] = $pair;

    $cutoff = Carbon::parse('2026-03-01 12:00:00');

    $this->travelTo($cutoff->copy()->subDays(5));
    $store->store(Records::trace(['id' => 'old-1', 'status' => Status::Completed]), [Records::span('old-1', ['id' => 'old-1-span'])]);
    $store->store(Records::trace(['id' => 'old-2', 'status' => Status::Completed]), [Records::span('old-2', ['id' => 'old-2-span'])]);

    $this->travelTo($cutoff);
    $store->store(Records::trace(['id' => 'boundary', 'status' => Status::Completed]), [Records::span('boundary', ['id' => 'boundary-span'])]);

    $this->travelTo($cutoff->copy()->addDay());
    $store->store(Records::trace(['id' => 'new', 'status' => Status::Completed]), [Records::span('new', ['id' => 'new-span'])]);

    expect($store->prune($cutoff))->toBe(2)
        ->and($probe->trace('old-1'))->toBeNull()
        ->and($probe->trace('old-2'))->toBeNull()
        ->and($probe->spans('old-1'))->toBe([])
        ->and($probe->spans('old-2'))->toBe([])
        ->and($probe->trace('boundary'))->not->toBeNull()
        ->and($probe->spans('boundary'))->toHaveCount(1)
        ->and($probe->trace('new'))->not->toBeNull()
        ->and($probe->spans('new'))->toHaveCount(1)
        ->and($probe->traceCount())->toBe(2)
        ->and($probe->spanCount())->toBe(2)
        ->and($store->prune($cutoff))->toBe(0);
})->with('stores');

it('prunes by when a trace was first stored, not by when it started', function (array $pair) {
    [$store, $probe] = $pair;

    $this->travelTo(Carbon::parse('2026-03-01 12:00:00'));
    $store->store(Records::trace(['id' => 'trace-1', 'startedAt' => Carbon::parse('2020-01-01 00:00:00')]), []);

    expect($store->prune(Carbon::parse('2026-02-28 12:00:00')))->toBe(0)
        ->and($probe->trace('trace-1'))->not->toBeNull();
})->with('stores');

it('clears every trace and span', function (array $pair) {
    [$store, $probe] = $pair;

    $store->store(Records::trace(['id' => 'trace-1']), [Records::span('trace-1', ['id' => 'span-1'])]);
    $store->store(Records::trace(['id' => 'trace-2']), [Records::span('trace-2', ['id' => 'span-2'])]);

    $store->clear();

    expect($probe->traceCount())->toBe(0)
        ->and($probe->spanCount())->toBe(0);
})->with('stores');

it('keeps milliseconds and converts datetimes to the app timezone', function (array $pair, string $started, string $ended, string $expectedStarted, string $expectedEnded) {
    [$store, $probe] = $pair;

    config(['app.timezone' => 'Europe/Berlin']);

    $store->store(
        Records::trace([
            'id' => 'trace-1',
            'status' => Status::Completed,
            'startedAt' => Carbon::parse($started, 'America/New_York'),
            'endedAt' => Carbon::parse($ended, 'America/New_York')->toDateTimeImmutable(),
        ]),
        [Records::span('trace-1', [
            'id' => 'span-1',
            'startedAt' => Carbon::parse($started, 'America/New_York')->toDateTimeImmutable(),
            'endedAt' => Carbon::parse($ended, 'America/New_York'),
        ])],
    );

    expect($probe->trace('trace-1'))->toMatchArray(['started_at' => $expectedStarted, 'ended_at' => $expectedEnded])
        ->and($probe->spans('trace-1')[0])->toMatchArray(['started_at' => $expectedStarted, 'ended_at' => $expectedEnded]);
})->with('stores')->with([
    'whole second and half second' => ['2026-06-15 14:30:00.000', '2026-06-15 14:30:01.500', '2026-06-15 20:30:00.000', '2026-06-15 20:30:01.500'],
    'half second and whole second' => ['2026-01-15 09:00:00.500', '2026-01-15 09:00:02.000', '2026-01-15 15:00:00.500', '2026-01-15 15:00:02.000'],
]);

it('reads null fields back as null', function (array $pair) {
    [$store, $probe] = $pair;

    $store->store(
        Records::trace(['id' => 'trace-1']),
        [Records::span('trace-1', ['id' => 'span-1', 'status' => Status::Running])],
    );

    $nulls = [
        'agent_class', 'issue_kind', 'error_class', 'error_message', 'error_source', 'error_http_status',
        'provider', 'model', 'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens',
        'reasoning_tokens', 'cost', 'duration_ms', 'metadata', 'ended_at',
    ];

    expect($probe->trace('trace-1'))->toMatchArray(array_fill_keys(array_merge($nulls, ['conversation_id', 'user_id', 'user_type', 'prompt_excerpt', 'response_excerpt']), null))
        ->and($probe->trace('trace-1'))->toMatchArray(['streamed' => false, 'recovered' => false, 'child_failed' => false])
        ->and($probe->spans('trace-1')[0])->toMatchArray(array_fill_keys(array_merge($nulls, ['parent_id', 'step_number', 'responding_model', 'input', 'output']), null))
        ->and($probe->spans('trace-1')[0])->toMatchArray(['attempt' => 1, 'sequence' => 0, 'redacted' => false, 'truncated' => false]);
})->with('stores');

it('reads every populated field back as stored', function (array $pair) {
    [$store, $probe] = $pair;

    $this->travelTo(Carbon::parse('2026-03-01 12:00:00.123'));

    $store->store(
        Records::trace([
            'id' => 'trace-1',
            'type' => SpanType::Agent,
            'name' => 'Support agent',
            'status' => Status::Failed,
            'startedAt' => Carbon::parse('2026-03-01 11:59:58.250'),
            'agentClass' => 'App\\Agents\\Support',
            'streamed' => true,
            'recovered' => true,
            'childFailed' => true,
            'issueKind' => IssueKind::RateLimited,
            'errorClass' => 'RateLimitException',
            'errorMessage' => 'Too many requests',
            'errorSource' => ErrorSource::Step,
            'errorHttpStatus' => 429,
            'provider' => 'anthropic',
            'model' => 'claude-sonnet',
            'conversationId' => 'conversation-1',
            'userId' => '42',
            'userType' => 'App\\Models\\User',
            'durationMs' => 1750.25,
            'promptExcerpt' => 'Where is my order?',
            'responseExcerpt' => 'It ships today.',
            'metadata' => ['tags' => ['a', 'b'], 'nested' => ['ratio' => 1.0]],
            'endedAt' => Carbon::parse('2026-03-01 12:00:00.000'),
        ]),
        [
            Records::span('trace-1', ['id' => 'parent', 'type' => SpanType::Agent, 'name' => 'agent', 'sequence' => 0]),
            Records::span('trace-1', [
                'id' => 'span-1',
                'type' => SpanType::Step,
                'name' => 'step 1',
                'status' => Status::Failed,
                'startedAt' => Carbon::parse('2026-03-01 11:59:59.125'),
                'parentId' => 'parent',
                'agentClass' => 'App\\Agents\\Support',
                'attempt' => 2,
                'sequence' => 1,
                'stepNumber' => 3,
                'provider' => 'anthropic',
                'model' => 'claude-sonnet',
                'respondingModel' => 'claude-sonnet-20260101',
                'inputTokens' => 100,
                'outputTokens' => 50,
                'cacheReadTokens' => 20,
                'cacheWriteTokens' => 10,
                'reasoningTokens' => 5,
                'cost' => 0.0123456789,
                'input' => ['messages' => [['role' => 'user', 'content' => 'Where is my order?']]],
                'output' => ['text' => 'It ships today.'],
                'metadata' => ['finish' => 'stop'],
                'redacted' => true,
                'truncated' => true,
                'issueKind' => IssueKind::ProviderOverloaded,
                'errorClass' => 'OverloadedException',
                'errorMessage' => 'Overloaded',
                'errorSource' => ErrorSource::Tool,
                'errorHttpStatus' => 529,
                'durationMs' => 875.5,
                'endedAt' => Carbon::parse('2026-03-01 12:00:00.000'),
            ]),
        ],
    );

    expect($probe->trace('trace-1'))->toBe([
        'id' => 'trace-1',
        'type' => 'agent',
        'name' => 'Support agent',
        'agent_class' => 'App\\Agents\\Support',
        'status' => 'failed',
        'streamed' => true,
        'recovered' => true,
        'child_failed' => true,
        'issue_kind' => 'rate_limited',
        'error_class' => 'RateLimitException',
        'error_message' => 'Too many requests',
        'error_source' => 'step',
        'error_http_status' => 429,
        'provider' => 'anthropic',
        'model' => 'claude-sonnet',
        'conversation_id' => 'conversation-1',
        'user_id' => '42',
        'user_type' => 'App\\Models\\User',
        'input_tokens' => 100,
        'output_tokens' => 50,
        'cache_read_tokens' => 20,
        'cache_write_tokens' => 10,
        'reasoning_tokens' => 5,
        'cost' => 0.0123456789,
        'span_count' => 2,
        'unpriced_span_count' => 0,
        'duration_ms' => 1750.25,
        'prompt_excerpt' => 'Where is my order?',
        'response_excerpt' => 'It ships today.',
        'metadata' => ['tags' => ['a', 'b'], 'nested' => ['ratio' => 1.0]],
        'started_at' => '2026-03-01 11:59:58.250',
        'ended_at' => '2026-03-01 12:00:00.000',
        'created_at' => '2026-03-01 12:00:00.123',
        'updated_at' => '2026-03-01 12:00:00.123',
    ])->and($probe->spans('trace-1')[1])->toBe([
        'id' => 'span-1',
        'trace_id' => 'trace-1',
        'parent_id' => 'parent',
        'type' => 'step',
        'name' => 'step 1',
        'agent_class' => 'App\\Agents\\Support',
        'status' => 'failed',
        'attempt' => 2,
        'sequence' => 1,
        'step_number' => 3,
        'provider' => 'anthropic',
        'model' => 'claude-sonnet',
        'responding_model' => 'claude-sonnet-20260101',
        'input_tokens' => 100,
        'output_tokens' => 50,
        'cache_read_tokens' => 20,
        'cache_write_tokens' => 10,
        'reasoning_tokens' => 5,
        'cost' => 0.0123456789,
        'input' => ['messages' => [['role' => 'user', 'content' => 'Where is my order?']]],
        'output' => ['text' => 'It ships today.'],
        'metadata' => ['finish' => 'stop'],
        'redacted' => true,
        'truncated' => true,
        'issue_kind' => 'provider_overloaded',
        'error_class' => 'OverloadedException',
        'error_message' => 'Overloaded',
        'error_source' => 'tool',
        'error_http_status' => 529,
        'duration_ms' => 875.5,
        'started_at' => '2026-03-01 11:59:59.125',
        'ended_at' => '2026-03-01 12:00:00.000',
        'created_at' => '2026-03-01 12:00:00.123',
        'updated_at' => '2026-03-01 12:00:00.123',
    ]);
})->with('stores');
