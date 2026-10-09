<?php

use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Storage\Contracts\TraceStore;
use Astro\Trail\Storage\DatabaseTraceStore;
use Astro\Trail\Tests\Fixtures\Storage\Records;
use Astro\Trail\Tests\Fixtures\Storage\Summaries;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

/*
|--------------------------------------------------------------------------
| The per-run summaries of models and tools
|--------------------------------------------------------------------------
|
| Every write of a run rebuilds its rows in trail_trace_models and
| trail_trace_tools from the spans the database holds. These tests state the
| rows exactly, read back with the query builder.
|
*/

beforeEach(function () {
    // The clock is frozen: a span's creation time is what open_at is compared with.
    $this->travelTo(Carbon::parse('2026-03-01 12:00:00'));

    $this->store = app(TraceStore::class);

    /** A step of the run "run-1"; the model is openai's gpt-a unless given. */
    $this->step = fn (string $id, array $attributes = []) => Records::span('run-1', array_merge([
        'id' => $id, 'provider' => 'openai', 'model' => 'gpt-a', 'status' => Status::Completed,
    ], $attributes));

    $this->tool = fn (string $id, string $name, Status $status = Status::Completed) => Records::span('run-1', [
        'id' => $id, 'type' => SpanType::Tool, 'name' => $name, 'status' => $status,
    ]);

    $this->put = fn (array $spans, array $trace = []) => $this->store->store(Records::trace(array_merge(['id' => 'run-1', 'status' => Status::Completed], $trace)), $spans);

    /** A model row as the summary holds it, with the columns a test leaves out at their defaults. */
    $this->row = fn (array $attributes) => array_merge([
        'trace_id' => 'run-1', 'provider' => 'openai', 'model' => 'gpt-a', 'run_name' => 'Support agent', 'started_at' => '2026-01-01 12:00:00.000',
        'provider_first' => false, 'steps' => 1, 'reported_steps' => 1, 'unpriced_steps' => 0, 'unpriced_tokens' => null,
        'open_at' => null, 'input_tokens' => null, 'uncached_input_tokens' => null, 'output_tokens' => null,
        'cache_read_tokens' => null, 'cache_write_tokens' => null, 'reasoning_tokens' => null, 'cost' => null,
    ], $attributes);
});

it('writes a row for each provider and model with exact sums, and counts what it could not price', function () {
    ($this->put)([
        Records::span('run-1', ['id' => 'agent', 'type' => SpanType::Agent, 'name' => 'Support agent']),
        ($this->step)('a1', ['inputTokens' => 100, 'outputTokens' => 20, 'cacheReadTokens' => 30, 'cacheWriteTokens' => 10, 'reasoningTokens' => 5, 'cost' => 0.0123456789]),
        ($this->step)('a2', ['inputTokens' => 50, 'outputTokens' => 10, 'cost' => 0.5]),
        ($this->step)('b1', ['model' => 'gpt-b', 'inputTokens' => 200, 'outputTokens' => 40]),
        ($this->step)('c1', ['provider' => 'anthropic', 'model' => 'claude-x', 'inputTokens' => 10, 'outputTokens' => 1, 'cost' => 0.25]),
        ($this->tool)('t1', 'lookup'),
    ]);

    expect(Summaries::models('run-1'))->toBe([
        ($this->row)(['provider' => 'anthropic', 'model' => 'claude-x', 'provider_first' => true, 'input_tokens' => 10, 'uncached_input_tokens' => 10, 'output_tokens' => 1, 'cost' => '0.2500000000']),
        ($this->row)(['model' => 'gpt-a', 'provider_first' => true, 'steps' => 2, 'reported_steps' => 2, 'input_tokens' => 150, 'uncached_input_tokens' => 110, 'output_tokens' => 30,
            'cache_read_tokens' => 30, 'cache_write_tokens' => 10, 'reasoning_tokens' => 5, 'cost' => '0.5123456789']),
        ($this->row)(['model' => 'gpt-b', 'unpriced_steps' => 1, 'unpriced_tokens' => 240, 'input_tokens' => 200, 'uncached_input_tokens' => 200, 'output_tokens' => 40]),
    ]);
});

it('marks exactly one row of each provider of the run', function () {
    ($this->put)([
        ($this->step)('a1', ['model' => 'gpt-b']),
        ($this->step)('a2', ['model' => 'gpt-a']),
        ($this->step)('a3', ['model' => 'gpt-c']),
        ($this->step)('c1', ['provider' => 'anthropic', 'model' => 'claude-x']),
    ]);

    $rows = Summaries::models('run-1');

    expect(Summaries::only($rows, ['provider', 'model', 'provider_first']))->toBe([
        ['provider' => 'anthropic', 'model' => 'claude-x', 'provider_first' => true],
        ['provider' => 'openai', 'model' => 'gpt-a', 'provider_first' => true],
        ['provider' => 'openai', 'model' => 'gpt-b', 'provider_first' => false],
        ['provider' => 'openai', 'model' => 'gpt-c', 'provider_first' => false],
    ]);
});

it('keeps a row, with no steps and nothing summed, for a model only an agent span asked for', function () {
    ($this->put)([
        Records::span('run-1', ['id' => 'agent', 'type' => SpanType::Agent, 'name' => 'Support agent', 'provider' => 'openai', 'model' => 'o3']),
        ($this->step)('a1', ['inputTokens' => 10, 'outputTokens' => 2, 'cost' => 0.5]),
    ]);

    expect(Summaries::models('run-1'))->toBe([
        ($this->row)(['model' => 'gpt-a', 'provider_first' => true, 'input_tokens' => 10, 'uncached_input_tokens' => 10, 'output_tokens' => 2, 'cost' => '0.5000000000']),
        ($this->row)(['model' => 'o3', 'steps' => 0, 'reported_steps' => 0]),
    ]);
});

it('keeps the usage of a billing span that lacks its model or its provider in a row of its own', function () {
    ($this->put)([
        ($this->step)('a1', ['model' => null, 'inputTokens' => 10, 'cost' => 0.5]),
        ($this->step)('a2', ['provider' => null, 'model' => null, 'inputTokens' => 20, 'outputTokens' => 4]),
        ($this->step)('a3', ['provider' => null, 'model' => 'orphan', 'inputTokens' => 30]),
        ($this->step)('x1', ['provider' => 'other', 'model' => null, 'inputTokens' => 1]),
        ($this->step)('x2', ['provider' => 'other', 'model' => 'known', 'inputTokens' => 2]),
        // Not billing and without an identity: no row.
        ($this->tool)('t1', 'lookup'),
        Records::span('run-1', ['id' => 'agent', 'type' => SpanType::Agent]),
    ]);

    expect(Summaries::only(Summaries::models('run-1'), ['provider', 'model', 'provider_first', 'steps', 'input_tokens', 'output_tokens', 'cost']))->toBe([
        ['provider' => null, 'model' => null, 'provider_first' => false, 'steps' => 1, 'input_tokens' => 20, 'output_tokens' => 4, 'cost' => null],
        ['provider' => null, 'model' => 'orphan', 'provider_first' => false, 'steps' => 1, 'input_tokens' => 30, 'output_tokens' => null, 'cost' => null],
        ['provider' => 'openai', 'model' => null, 'provider_first' => true, 'steps' => 1, 'input_tokens' => 10, 'output_tokens' => null, 'cost' => '0.5000000000'],
        ['provider' => 'other', 'model' => null, 'provider_first' => false, 'steps' => 1, 'input_tokens' => 1, 'output_tokens' => null, 'cost' => null],
        ['provider' => 'other', 'model' => 'known', 'provider_first' => true, 'steps' => 1, 'input_tokens' => 2, 'output_tokens' => null, 'cost' => null],
    ]);
});

it('counts steps, steps that reported usage and steps that could not be priced apart, and a step priced at nothing is priced', function () {
    ($this->put)([
        ($this->step)('s1'),
        ($this->step)('s2', ['inputTokens' => 10, 'outputTokens' => 5, 'cost' => 0.0]),
        ($this->step)('s3', ['inputTokens' => 7, 'outputTokens' => 3, 'cacheReadTokens' => 2]),
        ($this->step)('u1', ['model' => 'gpt-u', 'inputTokens' => 4]),
    ]);

    expect(Summaries::models('run-1'))->toBe([
        ($this->row)(['provider_first' => true, 'steps' => 3, 'reported_steps' => 2, 'unpriced_steps' => 1, 'unpriced_tokens' => 10,
            'input_tokens' => 17, 'uncached_input_tokens' => 15, 'output_tokens' => 8, 'cache_read_tokens' => 2, 'cost' => '0.0000000000']),
        ($this->row)(['model' => 'gpt-u', 'unpriced_steps' => 1, 'unpriced_tokens' => 4, 'input_tokens' => 4, 'uncached_input_tokens' => 4]),
    ]);
});

it('sums the uncached input per step, never below zero, and leaves it null when no step reported input', function () {
    ($this->put)([
        // More cached than input: nothing is uncached, and it takes nothing from the other step.
        ($this->step)('a1', ['inputTokens' => 100, 'cacheReadTokens' => 80, 'cacheWriteTokens' => 40]),
        ($this->step)('a2', ['inputTokens' => 50]),
        // No input: contributes nothing, whatever it cached.
        ($this->step)('a3', ['outputTokens' => 9, 'cacheReadTokens' => 5]),
        ($this->step)('b1', ['model' => 'gpt-b', 'outputTokens' => 9]),
        ($this->step)('c1', ['model' => 'gpt-c', 'inputTokens' => 70]),
    ]);

    expect(Summaries::only(Summaries::models('run-1'), ['model', 'steps', 'input_tokens', 'uncached_input_tokens', 'cache_read_tokens']))->toBe([
        ['model' => 'gpt-a', 'steps' => 3, 'input_tokens' => 150, 'uncached_input_tokens' => 50, 'cache_read_tokens' => 85],
        ['model' => 'gpt-b', 'steps' => 1, 'input_tokens' => null, 'uncached_input_tokens' => null, 'cache_read_tokens' => null],
        ['model' => 'gpt-c', 'steps' => 1, 'input_tokens' => 70, 'uncached_input_tokens' => 70, 'cache_read_tokens' => null],
    ]);
});

it('rebuilds the rows at every write: open_at follows the newest running step and a rewrite never duplicates', function () {
    $running = fn (string $id, array $attributes = []) => ($this->step)($id, array_merge(['status' => Status::Running], $attributes));

    ($this->put)([
        $running('s1'),
        Records::span('run-1', ['id' => 'agent', 'type' => SpanType::Agent, 'status' => Status::Running, 'provider' => 'openai', 'model' => 'o3']),
    ], ['status' => Status::Running]);

    $this->travelTo(Carbon::parse('2026-03-01 12:05:00'));
    ($this->put)([$running('s2')], ['status' => Status::Running]);

    expect(Summaries::only(Summaries::models('run-1'), ['model', 'steps', 'open_at']))->toBe([
        ['model' => 'gpt-a', 'steps' => 2, 'open_at' => '2026-03-01 12:05:00.000'],
        // Only a billing span can leave a model open.
        ['model' => 'o3', 'steps' => 0, 'open_at' => null],
    ]);

    $this->travelTo(Carbon::parse('2026-03-01 12:10:00'));
    ($this->put)([($this->step)('s1', ['inputTokens' => 5]), ($this->step)('s2', ['inputTokens' => 6]), ($this->step)('s3', ['inputTokens' => 7])]);

    expect(Summaries::only(Summaries::models('run-1'), ['model', 'steps', 'open_at', 'input_tokens']))->toBe([
        ['model' => 'gpt-a', 'steps' => 3, 'open_at' => null, 'input_tokens' => 18],
        ['model' => 'o3', 'steps' => 0, 'open_at' => null, 'input_tokens' => null],
    ])->and(DB::table('trail_trace_models')->count())->toBe(2);

    // The same write again leaves exactly the same rows.
    $before = Summaries::models('run-1');
    ($this->put)([($this->step)('s3', ['inputTokens' => 7])]);

    expect(DB::table('trail_trace_models')->count())->toBe(2)
        ->and(Summaries::models('run-1'))->toBe($before);
});

it('counts a span added by a late write', function () {
    ($this->put)([($this->step)('s1', ['inputTokens' => 5, 'cost' => 0.25]), ($this->tool)('t1', 'lookup')]);
    ($this->put)([($this->step)('s2', ['inputTokens' => 6, 'cost' => 0.5]), ($this->tool)('t2', 'lookup', Status::Failed)]);

    expect(Summaries::only(Summaries::models('run-1'), ['steps', 'input_tokens', 'cost']))->toBe([['steps' => 2, 'input_tokens' => 11, 'cost' => '0.7500000000']])
        ->and(Summaries::only(Summaries::tools('run-1'), ['name', 'calls', 'failed']))->toBe([['name' => 'lookup', 'calls' => 2, 'failed' => 1]]);
});

it('takes the name and the start of the run from its stored row, not from a late write', function () {
    ($this->put)([($this->step)('s1')], ['name' => 'Stored agent', 'startedAt' => Carbon::parse('2026-01-01 12:00:00.250')]);
    ($this->put)([($this->step)('s2'), ($this->tool)('t1', 'lookup')], ['name' => 'Late agent', 'status' => Status::Running, 'startedAt' => Carbon::parse('2026-01-02 08:00:00')]);

    expect(DB::table('trail_traces')->where('id', 'run-1')->value('name'))->toBe('Stored agent')
        ->and(Summaries::only(Summaries::models('run-1'), ['run_name', 'started_at', 'steps']))->toBe([['run_name' => 'Stored agent', 'started_at' => '2026-01-01 12:00:00.250', 'steps' => 2]])
        ->and(Summaries::only(Summaries::tools('run-1'), ['run_name', 'started_at']))->toBe([['run_name' => 'Stored agent', 'started_at' => '2026-01-01 12:00:00.250']]);
});

it('counts tool calls by name across the run, failures apart, and has no row for a run without tools', function () {
    ($this->put)([
        ($this->tool)('t1', 'lookup'),
        ($this->tool)('t2', 'lookup', Status::Failed),
        ($this->tool)('t3', 'lookup'),
        ($this->tool)('t4', 'search', Status::Failed),
        ($this->step)('s1'),
    ]);

    expect(Summaries::tools('run-1'))->toBe([
        ['trace_id' => 'run-1', 'name' => 'lookup', 'run_name' => 'Support agent', 'started_at' => '2026-01-01 12:00:00.000', 'calls' => 3, 'failed' => 1],
        ['trace_id' => 'run-1', 'name' => 'search', 'run_name' => 'Support agent', 'started_at' => '2026-01-01 12:00:00.000', 'calls' => 1, 'failed' => 1],
    ]);

    ($this->store)->store(Records::trace(['id' => 'run-2', 'status' => Status::Completed]), [Records::span('run-2', ['id' => 'only-step', 'provider' => 'openai', 'model' => 'gpt-a'])]);

    expect(Summaries::tools('run-2'))->toBe([])
        ->and(count(Summaries::models('run-2')))->toBe(1);
});

it('adds exactly four statements to a write, whatever the run holds', function (int $models, int $tools) {
    $spans = [];

    for ($index = 0; $index < $models; $index++) {
        $spans[] = ($this->step)("s{$index}", ['model' => "gpt-{$index}", 'inputTokens' => 5]);
    }

    for ($index = 0; $index < $tools; $index++) {
        $spans[] = ($this->tool)("t{$index}", "tool-{$index}");
    }

    $summary = [];
    DB::listen(function ($query) use (&$summary) {
        if (preg_match('/trail_trace_(models|tools)/', $query->sql) === 1) {
            $summary[] = $query->sql;
        }
    });

    ($this->put)($spans);

    expect($summary)->toHaveCount(4)
        ->and($summary[0])->toMatch('/^delete from ["`]?trail_trace_models/')
        ->and($summary[1])->toMatch('/^insert into ["`]?trail_trace_models/')
        ->and($summary[2])->toMatch('/^delete from ["`]?trail_trace_tools/')
        ->and($summary[3])->toMatch('/^insert into ["`]?trail_trace_tools/')
        ->and(count(Summaries::models('run-1')))->toBe($models)
        ->and(count(Summaries::tools('run-1')))->toBe($tools);
})->with([
    'one model, no tools' => [1, 0],
    'four models, three tools' => [4, 3],
]);

it('removes the rows of a pruned run and leaves another run\'s', function () {
    ($this->put)([($this->step)('s1'), ($this->tool)('t1', 'lookup')]);
    $this->store->store(Records::trace(['id' => 'run-2', 'status' => Status::Completed]), [Records::span('run-2', ['id' => 's2', 'provider' => 'openai', 'model' => 'gpt-a']), Records::span('run-2', ['id' => 't2', 'type' => SpanType::Tool, 'name' => 'lookup'])]);

    DB::table('trail_traces')->where('id', 'run-1')->update(['created_at' => '2026-02-01 00:00:00.000']);

    expect($this->store->prune(Carbon::parse('2026-02-15 00:00:00')))->toBe(1)
        ->and(DB::table('trail_trace_models')->pluck('trace_id')->all())->toBe(['run-2'])
        ->and(DB::table('trail_trace_tools')->pluck('trace_id')->all())->toBe(['run-2']);
});

it('empties both summaries when it clears', function () {
    ($this->put)([($this->step)('s1'), ($this->tool)('t1', 'lookup')]);

    expect(DB::table('trail_trace_models')->count())->toBe(1)
        ->and(DB::table('trail_trace_tools')->count())->toBe(1);

    $this->store->clear();

    expect(DB::table('trail_trace_models')->count())->toBe(0)
        ->and(DB::table('trail_trace_tools')->count())->toBe(0);
});

it('leaves the rows of a swept run as they are, except that nothing is open any more', function () {
    config(['trail.stale_after' => 3600]);
    $running = fn (string $trace, string $span) => Records::span($trace, ['id' => $span, 'provider' => 'openai', 'model' => 'gpt-a', 'status' => Status::Running, 'inputTokens' => 5]);

    $this->store->store(Records::trace(['id' => 'old']), [$running('old', 's-old')]);
    $this->travelTo(Carbon::parse('2026-03-01 12:18:00'));
    $this->store->store(Records::trace(['id' => 'new']), [$running('new', 's-new')]);
    $this->travelTo(Carbon::parse('2026-03-01 12:20:00'));

    $before = Summaries::models('old');

    // Shorter than the configured stale time: the old run is swept, the new one is not.
    expect($this->store->sweep(300))->toBe(1)
        ->and(DB::table('trail_spans')->where('id', 's-old')->value('status'))->toBe('incomplete')
        ->and($before[0]['open_at'])->toBe('2026-03-01 12:00:00.000')
        ->and(Summaries::models('old'))->toBe([array_merge($before[0], ['open_at' => null])])
        ->and(Summaries::only(Summaries::models('new'), ['open_at']))->toBe([['open_at' => '2026-03-01 12:18:00.000']]);
});

it('fails the write, and leaves the rows as they were, when the summary cannot be written', function () {
    ($this->put)([($this->step)('s1', ['inputTokens' => 5]), ($this->tool)('t1', 'lookup')]);
    $before = [Summaries::models('run-1'), Summaries::tools('run-1')];

    $broken = true;
    DB::beforeExecuting(function (string $query) use (&$broken) {
        if ($broken && preg_match('/^insert into ["`]?trail_trace_tools/i', $query) === 1) {
            throw new RuntimeException('the tools cannot be written');
        }
    });

    expect(fn () => ($this->put)([($this->step)('s2', ['inputTokens' => 6]), ($this->tool)('t2', 'search')]))->toThrow(RuntimeException::class, 'the tools cannot be written');

    // The models were rebuilt before the tools failed; nothing of that write remains, the span included.
    expect([Summaries::models('run-1'), Summaries::tools('run-1')])->toBe($before)
        ->and(DB::table('trail_spans')->where('trace_id', 'run-1')->count())->toBe(2);

    $broken = false;
    ($this->put)([($this->step)('s2', ['inputTokens' => 6]), ($this->tool)('t2', 'search')]);

    expect(Summaries::only(Summaries::models('run-1'), ['steps', 'input_tokens']))->toBe([['steps' => 2, 'input_tokens' => 11]]);
});

it('groups names as the database compares them: one row for a model spelt in two cases', function () {
    ($this->put)([
        ($this->step)('s1', ['model' => 'GPT-5', 'inputTokens' => 10, 'cost' => 0.25]),
        ($this->step)('s2', ['model' => 'gpt-5', 'inputTokens' => 20, 'cost' => 0.5]),
        ($this->tool)('t1', 'Search'),
        ($this->tool)('t2', 'search'),
    ]);

    $rows = Summaries::models('run-1');

    expect($rows)->toHaveCount(1)
        ->and(strtolower((string) $rows[0]['model']))->toBe('gpt-5')
        ->and(Summaries::only($rows, ['steps', 'input_tokens', 'cost', 'provider_first']))->toBe([['steps' => 2, 'input_tokens' => 30, 'cost' => '0.7500000000', 'provider_first' => true]])
        ->and(Summaries::only(Summaries::tools('run-1'), ['calls']))->toBe([['calls' => 2]]);
})->skip(fn () => DB::connection()->getDriverName() !== 'mysql', 'only MySQL compares text without regard to case by default');

it('keeps a model spelt in two cases as two rows, each its own', function () {
    ($this->put)([
        ($this->step)('s1', ['model' => 'GPT-5', 'inputTokens' => 10]),
        ($this->step)('s2', ['model' => 'gpt-5', 'inputTokens' => 20]),
        ($this->tool)('t1', 'Search'),
        ($this->tool)('t2', 'search'),
    ]);

    $rows = Summaries::models('run-1');

    expect(Summaries::only($rows, ['model', 'steps', 'input_tokens']))->toBe([
        ['model' => 'GPT-5', 'steps' => 1, 'input_tokens' => 10],
        ['model' => 'gpt-5', 'steps' => 1, 'input_tokens' => 20],
    ])
        // Which of the two comes first is the database's ordering to decide; one of them does.
        ->and(array_sum(array_map(fn (array $row) => (int) $row['provider_first'], $rows)))->toBe(1)
        ->and(Summaries::only(Summaries::tools('run-1'), ['name', 'calls']))->toBe([['name' => 'Search', 'calls' => 1], ['name' => 'search', 'calls' => 1]]);
})->skip(fn () => DB::connection()->getDriverName() === 'mysql', 'MySQL compares text without regard to case by default');

it('marks a provider spelt in two cases once on MySQL and each on the others', function () {
    ($this->put)([
        ($this->step)('s1', ['provider' => 'OpenAI', 'model' => 'a']),
        ($this->step)('s2', ['provider' => 'openai', 'model' => 'b']),
    ]);

    $marked = array_sum(array_map(fn (array $row) => (int) $row['provider_first'], Summaries::models('run-1')));

    expect(count(Summaries::models('run-1')))->toBe(2)
        ->and($marked)->toBe(DB::connection()->getDriverName() === 'mysql' ? 1 : 2);
});

it('counts the spans another process committed after this transaction took its snapshot', function () {
    $default = (string) config('database.default');
    config(['database.connections.trail_other' => config("database.connections.{$default}")]);
    $other = new DatabaseTraceStore(app('db'), 'trail_other');

    try {
        // This connection reads once, which fixes what its transaction will see of committed rows.
        expect(DB::table('trail_spans')->where('trace_id', 'run-1')->count())->toBe(0);

        // Another process stores the run with one step and commits.
        $other->store(Records::trace(['id' => 'run-1']), [($this->step)('s1', ['inputTokens' => 5, 'cost' => 0.25])]);

        // This one stores a later step of the same run inside its older snapshot.
        ($this->put)([($this->step)('s2', ['inputTokens' => 6, 'cost' => 0.5])], ['status' => Status::Running]);

        // The run's totals are read under the snapshot and miss the other process's step; the summary does not.
        expect(DB::table('trail_traces')->where('id', 'run-1')->value('input_tokens'))->toBe(6)
            ->and(Summaries::only(Summaries::models('run-1'), ['steps', 'input_tokens', 'cost']))->toBe([['steps' => 2, 'input_tokens' => 11, 'cost' => '0.7500000000']]);
    } finally {
        // What the other connection committed is not undone with this transaction, so it is removed by hand,
        // once this transaction has let go of the rows it locked.
        DB::connection()->rollBack(0);

        foreach (['trail_spans', 'trail_trace_models', 'trail_trace_tools'] as $table) {
            DB::connection('trail_other')->table($table)->where('trace_id', 'run-1')->delete();
        }

        DB::connection('trail_other')->table('trail_traces')->where('id', 'run-1')->delete();
    }
})->skip(fn () => DB::connection()->getDriverName() !== 'mysql', 'only MySQL reads rows committed after the snapshot in an insert-select, and the others are not tested with a second connection to a file or a shared server');
