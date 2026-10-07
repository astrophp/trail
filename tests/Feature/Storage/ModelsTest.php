<?php

use Astro\Trail\Enums\ErrorSource;
use Astro\Trail\Enums\IssueKind;
use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\Models\Span;
use Astro\Trail\Storage\Models\Trace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;

uses(RefreshDatabase::class);

function makeTrace(array $attributes = []): Trace
{
    return Trace::create(array_merge([
        'id' => 'trace-'.str()->uuid(),
        'type' => SpanType::Agent,
        'name' => 'Support agent',
        'status' => Status::Running,
        'started_at' => Carbon::parse('2026-01-01 12:00:00'),
    ], $attributes));
}

function makeSpan(Trace $trace, array $attributes = []): Span
{
    return Span::create(array_merge([
        'id' => 'span-'.str()->uuid(),
        'trace_id' => $trace->id,
        'type' => SpanType::Step,
        'name' => 'step',
        'status' => Status::Running,
        'started_at' => Carbon::parse('2026-01-01 12:00:00'),
    ], $attributes));
}

const NULLABLE_USAGE = [
    'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'reasoning_tokens',
    'cost', 'duration_ms', 'error_class', 'error_message', 'error_source', 'error_http_status',
    'issue_kind', 'provider', 'model', 'metadata', 'ended_at', 'agent_class',
];

it('reads missing trace values back as null, never zero', function () {
    $trace = makeTrace(['agent_class' => null])->fresh();

    foreach (array_merge(NULLABLE_USAGE, ['conversation_id', 'user_id', 'user_type', 'prompt_excerpt', 'response_excerpt']) as $column) {
        expect($trace->{$column})->toBeNull($column);
    }

    expect($trace->streamed)->toBeFalse()
        ->and($trace->recovered)->toBeFalse()
        ->and($trace->child_failed)->toBeFalse()
        ->and($trace->span_count)->toBe(0)
        ->and($trace->unpriced_span_count)->toBe(0);
});

it('reads missing span values back as null, never zero', function () {
    $span = makeSpan(makeTrace())->fresh();

    foreach (array_merge(NULLABLE_USAGE, ['parent_id', 'step_number', 'responding_model', 'input', 'output']) as $column) {
        expect($span->{$column})->toBeNull($column);
    }

    expect($span->redacted)->toBeFalse()
        ->and($span->truncated)->toBeFalse()
        ->and($span->attempt)->toBe(1)
        ->and($span->sequence)->toBe(0);
});

it('keeps zero distinct from null', function () {
    $trace = makeTrace(['input_tokens' => 0, 'cost' => 0.0, 'duration_ms' => 0.0])->fresh();
    $span = makeSpan($trace, ['input_tokens' => 0, 'cost' => 0.0, 'duration_ms' => 0.0])->fresh();

    foreach ([$trace, $span] as $model) {
        expect($model->input_tokens)->toBe(0)
            ->and($model->cost)->toBe(0.0)
            ->and($model->duration_ms)->toBe(0.0)
            ->and($model->output_tokens)->toBeNull();
    }
});

it('round-trips every enum case', function (BackedEnum $case) {
    $trace = makeTrace();
    $column = match ($case::class) {
        Status::class => 'status',
        SpanType::class => 'type',
        IssueKind::class => 'issue_kind',
        ErrorSource::class => 'error_source',
    };

    $trace->update([$column => $case]);
    $span = makeSpan($trace, [$column => $case]);

    expect($trace->fresh()->{$column})->toBe($case)
        ->and($span->fresh()->{$column})->toBe($case);
})->with(fn () => array_merge(
    Status::cases(),
    SpanType::cases(),
    IssueKind::cases(),
    ErrorSource::cases(),
));

it('treats every status except running as final', function () {
    foreach (Status::cases() as $status) {
        expect($status->isFinal())->toBe($status !== Status::Running);
    }
});

it('preserves millisecond precision', function (string $time, string $expected) {
    $trace = makeTrace(['started_at' => Carbon::parse($time), 'ended_at' => Carbon::parse($time)])->fresh();
    $span = makeSpan($trace, ['started_at' => Carbon::parse($time)])->fresh();

    expect($trace->started_at->format('Y-m-d H:i:s.v'))->toBe($expected)
        ->and($trace->ended_at?->format('Y-m-d H:i:s.v'))->toBe($expected)
        ->and($span->started_at->format('Y-m-d H:i:s.v'))->toBe($expected);
})->with([
    'milliseconds' => ['2026-01-01 12:00:00.123', '2026-01-01 12:00:00.123'],
    'trailing zeros' => ['2026-01-01 12:00:00.500', '2026-01-01 12:00:00.500'],
    'whole second' => ['2026-01-01 12:00:00.000', '2026-01-01 12:00:00.000'],
]);

it('round-trips nested json with unicode and key order', function () {
    $payload = [
        'zeta' => ['naïve' => 'café ☕', 'emoji' => '日本語 🚀'],
        'alpha' => [1, 2, ['b' => null, 'a' => 0]],
        'middle' => false,
    ];

    $trace = makeTrace(['metadata' => $payload])->fresh();
    $span = makeSpan($trace, ['input' => $payload, 'output' => $payload, 'metadata' => $payload])->fresh();

    expect($trace->metadata)->toBe($payload)
        ->and($span->input)->toBe($payload)
        ->and($span->output)->toBe($payload)
        ->and($span->metadata)->toBe($payload)
        ->and(array_keys($span->input))->toBe(['zeta', 'alpha', 'middle']);
});

it('keeps small costs', function () {
    $trace = makeTrace(['cost' => 0.0000000125])->fresh();
    $span = makeSpan($trace, ['cost' => 0.0000000125])->fresh();

    expect($trace->cost)->toBeFloat()->toEqualWithDelta(0.0000000125, 1e-12)
        ->and($span->cost)->toBeFloat()->toEqualWithDelta(0.0000000125, 1e-12);
});

it('relates traces, spans, parents and children', function () {
    $trace = makeTrace();
    $parent = makeSpan($trace, ['type' => SpanType::Agent]);
    $child = makeSpan($trace, ['parent_id' => $parent->id]);

    expect($trace->spans()->count())->toBe(2)
        ->and($child->trace->is($trace))->toBeTrue()
        ->and($child->parent?->is($parent))->toBeTrue()
        ->and($parent->parent)->toBeNull()
        ->and($parent->children->modelKeys())->toBe([$child->id]);
});

it('follows the configured storage connection', function () {
    expect((new Trace)->getConnectionName())->toBeNull()
        ->and((new Span)->getConnectionName())->toBeNull();

    config([
        'database.connections.trail_secondary' => config('database.connections.'.config('database.default')),
        'trail.storage.connection' => 'trail_secondary',
    ]);

    expect((new Trace)->getConnectionName())->toBe('trail_secondary')
        ->and((new Span)->getConnectionName())->toBe('trail_secondary');
});
