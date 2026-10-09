<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\Queries\AgentBreakdown;
use Astro\Trail\Queries\TimeRange;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Agents\ResearcherAgent;
use Astro\Trail\Tests\Fixtures\Capture\Failures;
use Astro\Trail\Tests\Fixtures\Capture\Streams;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Storage\DatabaseStoreProbe;
use Astro\Trail\Tests\Fixtures\Storage\Summaries;
use Astro\Trail\Tests\Fixtures\Tools\CallbackTool;
use Astro\Trail\Tests\Fixtures\Tools\LookupTool;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Http;
use Laravel\Ai\Embeddings;

/*
|--------------------------------------------------------------------------
| The per-run summaries of runs as they are captured
|--------------------------------------------------------------------------
|
| The rows of trail_trace_models and trail_trace_tools that real captured
| runs leave, stated exactly, and their agreement with the grouped reads of
| spans that the agents breakdown makes.
|
*/

beforeEach(function () {
    config(['cache.default' => 'array']);
    config(['trail.pricing' => [
        'anthropic' => [
            FakeAnthropic::MODEL => ['input' => 3.0, 'output' => 15.0],
            'claude-sonnet-5-5' => ['input' => 4.0, 'output' => 20.0],
            'model-a' => ['input' => 3.0, 'output' => 15.0],
            'model-b' => ['input' => 4.0, 'output' => 20.0],
        ],
        'openai' => ['text-embedding-3-small' => ['input' => 2.0]],
    ]]);

    /** The rows of the run that began first in the test, after the flush. */
    $this->summary = function (int $position = 0): array {
        Trail::flush();
        $id = $this->sdk->invocationIds()[$position];

        return [Summaries::models($id), Summaries::tools($id), $id];
    };

    /** The moment the run started, as the trace row holds it. */
    $this->startOf = fn (string $id) => (new DatabaseStoreProbe)->trace($id)['started_at'];

    $this->model = fn (array $attributes) => array_merge([
        'provider' => 'anthropic', 'model' => FakeAnthropic::MODEL, 'run_name' => 'AssistantAgent', 'provider_first' => false,
        'steps' => 1, 'reported_steps' => 1, 'unpriced_steps' => 0, 'unpriced_tokens' => null, 'open_at' => null,
        'input_tokens' => null, 'uncached_input_tokens' => null, 'output_tokens' => null, 'cache_read_tokens' => null,
        'cache_write_tokens' => null, 'reasoning_tokens' => null, 'cost' => null,
    ], $attributes);

    $this->delegating = fn (string $name = 'ResearcherAgent', array $usage = []) => FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => $name, 'input' => ['task' => 'Dig', 'query' => 'x']]], usage: $usage);
});

/** The rows with the columns that name the run, which differ from run to run, left out. */
function withoutRun(array $rows): array
{
    return array_map(fn (array $row) => array_diff_key($row, ['trace_id' => 0, 'started_at' => 0]), $rows);
}

it('summarises a plain run', function () {
    FakeAnthropic::script([FakeAnthropic::text('Hello', usage: ['input_tokens' => 100, 'output_tokens' => 20])]);

    (new AssistantAgent)->prompt('Hi', model: FakeAnthropic::MODEL);
    [$models, $tools, $id] = ($this->summary)();

    expect(withoutRun($models))->toBe([
        ($this->model)(['provider_first' => true, 'input_tokens' => 100, 'uncached_input_tokens' => 100, 'output_tokens' => 20, 'cost' => '0.0006000000']),
    ])->and($tools)->toBe([])
        ->and($models[0]['trace_id'])->toBe($id)
        ->and($models[0]['started_at'])->toBe(($this->startOf)($id));
});

it('summarises a run whose sub-agent uses another model', function () {
    FakeAnthropic::script([
        ($this->delegating)('ResearcherAgent', ['input_tokens' => 100, 'output_tokens' => 20]),
        FakeAnthropic::text('found it', usage: ['input_tokens' => 10, 'output_tokens' => 5]),
        FakeAnthropic::text('Done', usage: ['input_tokens' => 7, 'output_tokens' => 3]),
    ]);

    (new AssistantAgent([new ResearcherAgent]))->prompt('Hi', model: FakeAnthropic::MODEL);
    [$models, $tools] = ($this->summary)();

    // The sub-agent's own steps and its agent span are one row; the parent's two steps another.
    expect(withoutRun($models))->toBe([
        ($this->model)(['model' => 'claude-sonnet-5-5', 'provider_first' => true, 'input_tokens' => 10, 'uncached_input_tokens' => 10, 'output_tokens' => 5, 'cost' => '0.0001400000']),
        ($this->model)(['steps' => 2, 'reported_steps' => 2, 'input_tokens' => 107, 'uncached_input_tokens' => 107, 'output_tokens' => 23, 'cost' => '0.0006660000']),
    ])->and(Summaries::only($tools, ['name', 'calls', 'failed']))->toBe([['name' => 'ResearcherAgent', 'calls' => 1, 'failed' => 0]]);
});

it('summarises a run that failed over, the failed attempt included', function () {
    FakeAnthropic::script([FakeAnthropic::error(429, 'Slow down'), FakeAnthropic::text('ok', usage: ['input_tokens' => 10, 'output_tokens' => 5])]);

    (new AssistantAgent)->prompt('Hi', provider: ['anthropic' => 'model-a', 'backup' => 'model-b']);
    [$models] = ($this->summary)();

    // Both attempts are the same provider here; the failed step is a step that reported nothing.
    expect(withoutRun($models))->toBe([
        ($this->model)(['model' => 'model-a', 'provider_first' => true, 'reported_steps' => 0]),
        ($this->model)(['model' => 'model-b', 'input_tokens' => 10, 'uncached_input_tokens' => 10, 'output_tokens' => 5, 'cost' => '0.0001400000']),
    ]);
});

it('summarises two providers of one run: a model and an embeddings call in a tool', function () {
    Http::fake(['api.openai.com/*' => Http::response([
        'data' => [['embedding' => [0.1, 0.2]], ['embedding' => [0.3, 0.4]]],
        'usage' => ['prompt_tokens' => 7, 'total_tokens' => 7],
    ])]);
    FakeAnthropic::script([
        FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'embed', 'input' => ['query' => 'x']]], usage: ['input_tokens' => 100, 'output_tokens' => 20]),
        FakeAnthropic::text('Done', usage: ['input_tokens' => 7, 'output_tokens' => 3]),
    ]);

    $embed = new CallbackTool('embed', fn () => (string) count(Embeddings::for(['a', 'b'])->generate()));

    (new AssistantAgent([$embed]))->prompt('Hi', model: FakeAnthropic::MODEL);
    [$models, $tools] = ($this->summary)();

    expect(withoutRun($models))->toBe([
        ($this->model)(['provider_first' => true, 'steps' => 2, 'reported_steps' => 2, 'input_tokens' => 107, 'uncached_input_tokens' => 107, 'output_tokens' => 23, 'cost' => '0.0006660000']),
        ($this->model)(['provider' => 'openai', 'model' => 'text-embedding-3-small', 'provider_first' => true, 'input_tokens' => 7, 'uncached_input_tokens' => 7, 'cost' => '0.0000140000']),
    ])->and(Summaries::only($tools, ['name', 'calls']))->toBe([['name' => 'embed', 'calls' => 1]]);
});

it('summarises an embeddings call made on its own', function () {
    Http::fake(['api.openai.com/*' => Http::response([
        'data' => [['embedding' => [0.1, 0.2]]],
        'usage' => ['prompt_tokens' => 7, 'total_tokens' => 7],
    ])]);

    Embeddings::for(['a'])->generate();
    [$models, $tools] = ($this->summary)();

    expect(withoutRun($models))->toBe([
        ($this->model)(['provider' => 'openai', 'model' => 'text-embedding-3-small', 'run_name' => 'Embeddings', 'provider_first' => true, 'input_tokens' => 7, 'uncached_input_tokens' => 7, 'cost' => '0.0000140000']),
    ])->and($tools)->toBe([]);
});

it('summarises a streamed run and its tool', function () {
    FakeAnthropic::script([
        FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'x']]], usage: ['input_tokens' => 100, 'output_tokens' => 20], text: 'Let me look'),
        FakeAnthropic::text('Done now', usage: ['input_tokens' => 7, 'output_tokens' => 3], model: 'claude-test-responding'),
    ]);

    Streams::drain((new AssistantAgent([new LookupTool]))->stream('Hi', model: FakeAnthropic::MODEL));
    [$models, $tools] = ($this->summary)();

    // The steps are stored under the requested model, whatever the stream said it responded with.
    expect(withoutRun($models))->toBe([
        ($this->model)(['provider_first' => true, 'steps' => 2, 'reported_steps' => 2, 'input_tokens' => 107, 'uncached_input_tokens' => 107, 'output_tokens' => 23, 'cost' => '0.0006660000']),
    ])->and(Summaries::only($tools, ['name', 'calls', 'failed']))->toBe([['name' => 'lookup', 'calls' => 1, 'failed' => 0]]);
});

it('counts a failed tool and a tool a sub-agent called with the run\'s own', function () {
    FakeAnthropic::script([
        ($this->delegating)('ResearcherAgent'),
        FakeAnthropic::toolUse([['id' => 'toolu_2', 'name' => 'lookup', 'input' => ['query' => 'a']]]),
        FakeAnthropic::text('found it'),
        FakeAnthropic::toolUse([['id' => 'toolu_3', 'name' => 'lookup', 'input' => ['query' => 'b']]]),
        FakeAnthropic::toolUse([['id' => 'toolu_4', 'name' => 'explode', 'input' => []]]),
    ]);

    $explode = new CallbackTool('explode', fn () => throw new RuntimeException('Tool broke'));

    Failures::thrown(fn () => (new AssistantAgent([new ResearcherAgent([new LookupTool]), new LookupTool, $explode]))->prompt('Hi', model: FakeAnthropic::MODEL));
    [, $tools] = ($this->summary)();

    expect(Summaries::only($tools, ['name', 'calls', 'failed']))->toBe([
        ['name' => 'ResearcherAgent', 'calls' => 1, 'failed' => 0],
        ['name' => 'explode', 'calls' => 1, 'failed' => 1],
        ['name' => 'lookup', 'calls' => 2, 'failed' => 0],
    ]);
});

it('leaves a step that is still running open, and closes it when the run is flushed again', function () {
    $id = Streams::abandonedAfter(2);
    Trail::flush();

    $probe = new DatabaseStoreProbe;
    $step = collect($probe->spans($id))->firstWhere('type', 'step');

    expect(Summaries::only(Summaries::models($id), ['steps', 'reported_steps', 'open_at', 'input_tokens', 'cost']))
        ->toBe([['steps' => 1, 'reported_steps' => 0, 'open_at' => $step['created_at'], 'input_tokens' => null, 'cost' => null]]);
});

it('agrees with the grouped reads of spans over a varied set of runs', function () {
    Http::fake(['api.openai.com/*' => Http::response([
        'data' => [['embedding' => [0.1, 0.2]]],
        'usage' => ['prompt_tokens' => 7, 'total_tokens' => 7],
    ])]);

    // A plain run, one with a sub-agent on another model, one that failed over, one with an embeddings call, a streamed one and a failing one.
    FakeAnthropic::script([FakeAnthropic::text('a', usage: ['input_tokens' => 100, 'output_tokens' => 20, 'cache_read_input_tokens' => 30])]);
    (new AssistantAgent)->prompt('Hi', model: FakeAnthropic::MODEL);

    FakeAnthropic::script([
        ($this->delegating)('ResearcherAgent', ['input_tokens' => 100, 'output_tokens' => 20]),
        FakeAnthropic::text('found it', usage: ['input_tokens' => 10, 'output_tokens' => 5]),
        FakeAnthropic::text('Done', usage: ['input_tokens' => 7, 'output_tokens' => 3]),
    ]);
    (new AssistantAgent([new ResearcherAgent]))->prompt('Hi', model: FakeAnthropic::MODEL);

    FakeAnthropic::script([FakeAnthropic::error(429, 'Slow down'), FakeAnthropic::text('ok', usage: ['input_tokens' => 10, 'output_tokens' => 5])]);
    (new AssistantAgent)->prompt('Hi', provider: ['anthropic' => 'model-a', 'backup' => 'model-b']);

    FakeAnthropic::script([
        FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'embed', 'input' => ['query' => 'x']]], usage: ['input_tokens' => 100, 'output_tokens' => 20]),
        FakeAnthropic::text('Done', usage: ['input_tokens' => 7, 'output_tokens' => 3]),
    ]);
    (new AssistantAgent([new CallbackTool('embed', fn () => (string) count(Embeddings::for(['a'])->generate()))]))->prompt('Hi', model: FakeAnthropic::MODEL);

    FakeAnthropic::script([
        FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'x']]], usage: ['input_tokens' => 100, 'output_tokens' => 20]),
        FakeAnthropic::text('Done now', usage: ['input_tokens' => 7, 'output_tokens' => 3]),
    ]);
    Streams::drain((new AssistantAgent([new LookupTool]))->stream('Hi', model: FakeAnthropic::MODEL));

    FakeAnthropic::script([FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'explode', 'input' => []]], usage: ['input_tokens' => 10, 'output_tokens' => 5])]);
    Failures::thrown(fn () => (new AssistantAgent([new CallbackTool('explode', fn () => throw new RuntimeException('Tool broke'))]))->prompt('Hi', model: FakeAnthropic::MODEL));

    Embeddings::for(['a'])->generate();
    Trail::flush();

    $range = new TimeRange(null, CarbonImmutable::now()->subDay(), CarbonImmutable::now()->addDay());
    $names = DB::table('trail_traces')->distinct()->pluck('name')->sort()->values()->all();

    expect($names)->toBe(['AssistantAgent', 'Embeddings'])
        ->and(DB::table('trail_traces')->count())->toBe(7);

    $number = fn (mixed $value) => $value === null ? null : (string) (int) $value;
    $cost = fn (mixed $value) => $value === null ? null : Summaries::decimal($value);

    foreach ($names as $name) {
        $spans = collect((new AgentBreakdown)->models($name, $range))->map(fn (object $row) => [
            'provider' => $row->provider, 'model' => $row->model, 'calls' => $number($row->calls), 'runs' => $number($row->runs),
            'input_tokens' => $number($row->input_tokens), 'output_tokens' => $number($row->output_tokens), 'cache_read_tokens' => $number($row->cache_read_tokens),
            'cache_write_tokens' => $number($row->cache_write_tokens), 'reasoning_tokens' => $number($row->reasoning_tokens),
            'cost_sum' => $cost($row->cost_sum), 'unpriced' => $number($row->unpriced),
        ])->sortBy(fn (array $row) => $row['provider'].'|'.$row['model'])->values()->all();

        $summary = DB::table('trail_trace_models')->where('run_name', $name)->whereNotNull('provider')->whereNotNull('model')
            ->groupBy('provider', 'model')->selectRaw('provider, model, sum(steps) as calls, count(*) as runs, sum(input_tokens) as input_tokens, sum(output_tokens) as output_tokens, sum(cache_read_tokens) as cache_read_tokens, sum(cache_write_tokens) as cache_write_tokens, sum(reasoning_tokens) as reasoning_tokens, sum(cost) as cost_sum, sum(unpriced_steps) as unpriced')
            ->get()->map(fn (object $row) => [
                'provider' => $row->provider, 'model' => $row->model, 'calls' => $number($row->calls), 'runs' => $number($row->runs),
                'input_tokens' => $number($row->input_tokens), 'output_tokens' => $number($row->output_tokens), 'cache_read_tokens' => $number($row->cache_read_tokens),
                'cache_write_tokens' => $number($row->cache_write_tokens), 'reasoning_tokens' => $number($row->reasoning_tokens),
                'cost_sum' => $cost($row->cost_sum), 'unpriced' => $number($row->unpriced),
            ])->sortBy(fn (array $row) => $row['provider'].'|'.$row['model'])->values()->all();

        expect($summary)->not->toBe([])->and($summary)->toBe($spans, "models of {$name}");

        $spanTools = collect((new AgentBreakdown)->tools($name, $range))->map(fn (object $row) => [
            'name' => $row->name, 'calls' => $number($row->calls), 'failed' => $number($row->failed), 'runs' => $number($row->runs),
        ])->sortBy('name')->values()->all();

        $summaryTools = DB::table('trail_trace_tools')->where('run_name', $name)->groupBy('name')
            ->selectRaw('name, sum(calls) as calls, sum(failed) as failed, count(*) as runs')
            ->get()->map(fn (object $row) => [
                'name' => $row->name, 'calls' => $number($row->calls), 'failed' => $number($row->failed), 'runs' => $number($row->runs),
            ])->sortBy('name')->values()->all();

        expect($summaryTools)->toBe($spanTools, "tools of {$name}");
    }

    // A provider's runs: the rows marked first, one for each run and provider, equal the distinct runs with a span of the provider.
    $marked = DB::table('trail_trace_models')->where('provider_first', true)->groupBy('provider')->selectRaw('provider, count(*) as runs')->orderBy('provider')->get()
        ->map(fn (object $row) => [$row->provider, (int) $row->runs])->all();
    $distinct = DB::table('trail_spans')->whereNotNull('provider')->groupBy('provider')->selectRaw('provider, count(distinct trace_id) as runs')->orderBy('provider')->get()
        ->map(fn (object $row) => [$row->provider, (int) $row->runs])->all();

    expect($marked)->toBe($distinct)->and($marked)->toBe([['anthropic', 6], ['openai', 2]]);
});

it('stays usable, reports the failure and leaves no rows when the summary cannot be written inside the application\'s transaction', function () {
    Exceptions::fake();
    $broken = false;
    DB::beforeExecuting(function (string $query) use (&$broken) {
        if ($broken && preg_match('/^insert into ["`]?trail_trace_tools/i', $query) === 1) {
            throw new RuntimeException('the tools cannot be written');
        }
    });

    FakeAnthropic::script([FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'x']]], usage: ['input_tokens' => 10, 'output_tokens' => 5]), FakeAnthropic::text('Done')]);

    $text = DB::transaction(function () use (&$broken) {
        $text = (new AssistantAgent([new LookupTool]))->prompt('Hi', model: FakeAnthropic::MODEL)->text;
        $broken = true;
        Trail::flush();

        // The application's own work in the same transaction goes on.
        expect(DB::select('select 1 as one')[0]->one)->toBe(1);

        return $text;
    });

    expect($text)->toBe('Done');
    Exceptions::assertReportedCount(1);
    expect(DB::table('trail_trace_models')->count())->toBe(0)
        ->and(DB::table('trail_trace_tools')->count())->toBe(0)
        // The flush wrote nothing at all: the run is only the row its early insert made.
        ->and(DB::table('trail_spans')->count())->toBe(0)
        ->and(DB::table('trail_traces')->count())->toBe(1);
});

it('stays usable when a summary table is gone at the flush', function () {
    Exceptions::fake();

    FakeAnthropic::script([FakeAnthropic::text('Hello', usage: ['input_tokens' => 10, 'output_tokens' => 5])]);
    $text = (new AssistantAgent)->prompt('Hi', model: FakeAnthropic::MODEL)->text;

    DB::statement('alter table trail_trace_tools rename to trail_trace_tools_away');
    Trail::flush();

    expect($text)->toBe('Hello')
        ->and(DB::select('select 1 as one')[0]->one)->toBe(1);

    Exceptions::assertReportedCount(1);
    DB::statement('alter table trail_trace_tools_away rename to trail_trace_tools');
})->skip(fn () => DB::connection()->getDriverName() !== 'pgsql', 'only Postgres refuses statements after a failed one, and undoes DDL with the transaction');
