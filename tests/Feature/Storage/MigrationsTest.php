<?php

use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Illuminate\Foundation\Testing\RefreshDatabaseState;
use Illuminate\Support\Facades\Schema;

// DDL commits implicitly on MySQL, so these tests manage the schema themselves
// instead of running inside a RefreshDatabase transaction.
beforeEach(function () {
    $this->artisan('migrate:fresh')->assertSuccessful();
});

afterEach(function () {
    $this->artisan('migrate:fresh')->assertSuccessful();
    RefreshDatabaseState::$migrated = false;
});

function trailTraceColumns(): array
{
    return [
        'id', 'type', 'name', 'agent_class', 'status', 'streamed', 'recovered', 'child_failed',
        'issue_kind', 'error_class', 'error_message', 'error_source', 'error_http_status',
        'provider', 'model', 'conversation_id', 'user_id', 'user_type',
        'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'reasoning_tokens',
        'cost', 'span_count', 'unpriced_span_count', 'duration_ms', 'prompt_excerpt', 'response_excerpt',
        'metadata', 'started_at', 'ended_at', 'created_at', 'updated_at',
    ];
}

function trailSpanColumns(): array
{
    return [
        'id', 'trace_id', 'parent_id', 'type', 'name', 'agent_class', 'status',
        'attempt', 'sequence', 'step_number', 'provider', 'model', 'responding_model',
        'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'reasoning_tokens',
        'cost', 'input', 'output', 'metadata', 'redacted', 'truncated',
        'issue_kind', 'error_class', 'error_message', 'error_source', 'error_http_status',
        'duration_ms', 'started_at', 'ended_at', 'created_at', 'updated_at',
    ];
}

it('creates both tables with every column', function () {
    expect(Schema::hasTable('trail_traces'))->toBeTrue()
        ->and(Schema::hasTable('trail_spans'))->toBeTrue()
        ->and(Schema::hasColumns('trail_traces', trailTraceColumns()))->toBeTrue()
        ->and(Schema::hasColumns('trail_spans', trailSpanColumns()))->toBeTrue()
        ->and(array_keys(Rows::columnsOf('trail_traces')))->toEqual(trailTraceColumns())
        ->and(array_keys(Rows::columnsOf('trail_spans')))->toEqual(trailSpanColumns());
});

it('removes both tables on rollback', function () {
    $this->artisan('migrate:rollback')->assertSuccessful();

    expect(Schema::hasTable('trail_traces'))->toBeFalse()
        ->and(Schema::hasTable('trail_spans'))->toBeFalse();
});

it('creates the expected indexes', function (string $table, array $columns) {
    expect(Rows::indexColumnsOf($table))->toContain($columns);
})->with([
    'traces started_at' => ['trail_traces', ['started_at']],
    'traces status' => ['trail_traces', ['status', 'started_at']],
    'traces agent' => ['trail_traces', ['agent_class', 'started_at']],
    'traces conversation' => ['trail_traces', ['conversation_id', 'started_at']],
    'traces user' => ['trail_traces', ['user_id', 'user_type', 'started_at']],
    'traces created_at' => ['trail_traces', ['created_at']],
    'spans trace' => ['trail_spans', ['trace_id', 'started_at']],
    'spans model' => ['trail_spans', ['provider', 'model', 'started_at']],
    'spans status' => ['trail_spans', ['status', 'created_at']],
]);

it('keeps index names within the shortest identifier limit', function (string $table) {
    foreach (Schema::getIndexes($table) as $index) {
        expect(strlen($index['name']))->toBeLessThanOrEqual(63);
    }
})->with(['trail_traces', 'trail_spans']);

it('marks optional columns nullable and required columns not nullable', function () {
    $nullable = [
        'trail_traces' => [
            'agent_class', 'issue_kind', 'error_class', 'error_message', 'error_source', 'error_http_status',
            'provider', 'model', 'conversation_id', 'user_id', 'user_type',
            'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'reasoning_tokens',
            'cost', 'duration_ms', 'prompt_excerpt', 'response_excerpt', 'metadata', 'ended_at',
        ],
        'trail_spans' => [
            'parent_id', 'agent_class', 'step_number', 'provider', 'model', 'responding_model',
            'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'reasoning_tokens',
            'cost', 'input', 'output', 'metadata',
            'issue_kind', 'error_class', 'error_message', 'error_source', 'error_http_status',
            'duration_ms', 'ended_at',
        ],
    ];

    foreach ($nullable as $table => $names) {
        $columns = Rows::columnsOf($table);

        foreach ($columns as $name => $column) {
            expect($column['nullable'])->toBe(in_array($name, $names, true), "{$table}.{$name}");
        }
    }
});

it('gives token, cost and duration columns no default', function (string $table) {
    $columns = Rows::columnsOf($table);

    foreach (['input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'reasoning_tokens', 'cost', 'duration_ms'] as $name) {
        expect($columns[$name]['default'])->toBeNull($name);
    }
})->with(['trail_traces', 'trail_spans']);
