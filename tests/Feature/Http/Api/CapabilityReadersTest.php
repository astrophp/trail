<?php

use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Http\Resources\TraceResource;
use Astro\Trail\Http\Resources\UsageBreakdown;
use Astro\Trail\Mcp\Tools\TrailListTraces;
use Astro\Trail\Mcp\Tools\TrailShowConversation;
use Astro\Trail\Mcp\Tools\TrailShowTrace;
use Astro\Trail\Queries\AgentBreakdown;
use Astro\Trail\Queries\TimeRange;
use Astro\Trail\Storage\ArrayTraceStore;
use Astro\Trail\Storage\Contracts\TraceStore;
use Astro\Trail\Storage\Models\Span;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Tests\Fixtures\Storage\Records;
use Astro\Trail\Tests\Fixtures\Storage\Summaries;
use Illuminate\Support\Carbon;
use Laravel\Mcp\Request;

beforeEach(function () {
    $this->app['env'] = 'local';
    Carbon::setTestNow('2026-01-01 13:00:00');
});

afterEach(function () {
    $this->app['env'] = 'testing';
    Carbon::setTestNow();
});

it('counts each billable operation once in stores, SQL summaries and raw model reads', function () {
    $trace = Records::trace(['id' => 'mixed', 'status' => Status::Completed]);
    $spans = [];
    foreach (SpanType::billable() as $i => $type) {
        $spans[] = Records::span($trace->id, [
            'id' => 'bill-'.$i, 'type' => $type, 'provider' => 'cohere', 'model' => 'same-model',
            'inputTokens' => $type === SpanType::Reranking ? null : 10,
            'searchUnits' => $type === SpanType::Reranking ? '0.100000' : null,
            'cost' => $type === SpanType::Reranking ? null : 0.1,
        ]);
    }
    foreach ([SpanType::Agent, SpanType::Tool] as $type) {
        $spans[] = Records::span($trace->id, ['type' => $type, 'provider' => 'cohere', 'model' => 'same-model', 'inputTokens' => 999, 'searchUnits' => 999, 'cost' => 999]);
    }
    $array = new ArrayTraceStore;
    foreach ([$array, app(TraceStore::class)] as $store) {
        $store->store($trace, $spans);
    }
    $stored = Trace::findOrFail($trace->id);
    expect($array->totals($trace->id)->inputTokens)->toBe(30)
        ->and($stored->input_tokens)->toBe(30)
        ->and($array->totals($trace->id)->searchUnits)->toBe('0.100000')
        ->and($array->totals($trace->id)->cost)->toBe(0.3)
        ->and($stored->cost)->toBe(0.3)
        ->and($stored->unpriced_span_count)->toBe(1)
        ->and(Summaries::only(Summaries::models($trace->id), ['steps', 'reported_steps', 'unpriced_steps']))->toBe([['steps' => 4, 'reported_steps' => 4, 'unpriced_steps' => 1]]);
    $models = app(AgentBreakdown::class)->models($trace->name, TimeRange::fromRequest(Illuminate\Http\Request::create('/')));
    expect((int) $models[0]->calls)->toBe(4)->and((int) $models[0]->unpriced)->toBe(1);
});

it('reads new root types and exact quantities in direct HTTP and MCP usage', function (SpanType $type, string|int|null $quantity, ?string $expected) {
    $trace = Records::trace(['id' => 'capability', 'type' => $type, 'status' => Status::Completed]);
    app(TraceStore::class)->store($trace, [Records::span($trace->id, [
        'id' => 'operation', 'type' => $type, 'searchUnits' => $quantity,
        'input' => ['query' => 'Synthetic evidence'], 'output' => ['answer' => 'Synthetic answer'],
        'metadata' => ['private' => 'not-in-mcp'],
    ])]);
    $list = $this->getJson('/trail/api/traces')->assertOk()->json('data.0');
    $detail = $this->getJson('/trail/api/traces/capability')->assertOk()->json('data');
    $search = $this->getJson('/trail/api/search?q=capability')->assertOk()->json('data.traces.0');
    foreach ([$list['usage'], $search['usage'], $detail['trace']['usage'], $detail['spans'][0]['usage'], $detail['usage']['rows'][0]['usage']] as $usage) {
        expect($usage['search_units'])->toBe($expected)
            ->and($usage['state'])->toBe($expected === null ? 'not_reported' : 'reported')
            ->and($usage['total_tokens'])->toBeNull();
    }
    expect($list['type'])->toBe($type->value)
        ->and($detail['coverage']['usage']['captured'])->toBe($expected === null ? 0 : 1);
    $response = app(TrailShowTrace::class)->handle(new Request(['id' => $trace->id]));
    $mcp = json_decode((string) $response->content(), true, flags: JSON_THROW_ON_ERROR);
    expect($mcp['spans'][0]['usage']['search_units'])->toBe($expected)
        ->and($mcp['spans'][0])->not->toHaveKeys(['input', 'output', 'metadata']);
})->with([
    'classification absent' => [SpanType::Classification, null, null],
    'reranking absent' => [SpanType::Reranking, null, null],
    'reranking zero' => [SpanType::Reranking, 0, '0.000000'],
    'reranking fraction' => [SpanType::Reranking, '0.100001', '0.100001'],
    'reranking maximum' => [SpanType::Reranking, '999999999999.999999', '999999999999.999999'],
]);

it('keeps nearest-agent quantities separate and never replaces persisted totals with returned-span subtotals', function () {
    $trace = Records::trace(['id' => 'nested', 'status' => Status::Completed]);
    $root = Records::span($trace->id, ['id' => 'root', 'sequence' => 1, 'type' => SpanType::Agent]);
    $tool = Records::span($trace->id, ['id' => 'tool', 'sequence' => 2, 'type' => SpanType::Tool, 'parentId' => 'root']);
    $child = Records::span($trace->id, ['id' => 'child', 'sequence' => 4, 'type' => SpanType::Agent, 'parentId' => 'tool']);
    $outer = Records::span($trace->id, ['id' => 'outer-call', 'sequence' => 3, 'type' => SpanType::Reranking, 'parentId' => 'tool', 'provider' => 'cohere', 'model' => 'same-model', 'searchUnits' => '0.1']);
    $inner = Records::span($trace->id, ['id' => 'inner-call', 'sequence' => 5, 'type' => SpanType::Reranking, 'parentId' => 'child', 'provider' => 'cohere', 'model' => 'same-model', 'searchUnits' => '0.2']);
    app(TraceStore::class)->store($trace, [$root, $tool, $child, $outer, $inner]);
    $stored = Trace::findOrFail($trace->id);
    $all = Span::query()->where('trace_id', $trace->id)->orderBy('sequence')->get();
    $run = TraceResource::of([$stored])->toArray($stored);
    $breakdown = UsageBreakdown::of($all, $run);
    $agents = collect($breakdown['agents'])->keyBy('span_id');
    expect($agents['root']['usage']['search_units'])->toBe('0.100000')
        ->and($agents['child']['usage']['search_units'])->toBe('0.200000')
        ->and(array_column($breakdown['rows'], 'agent_span_id'))->toBe(['root', 'child']);
    $subset = UsageBreakdown::of($all->whereIn('id', ['root', 'tool', 'outer-call']), $run);
    expect($subset['totals']['usage']['search_units'])->toBe('0.300000')
        ->and($subset['agents'][0]['usage']['search_units'])->toBe('0.100000');
    $delegated = app(AgentBreakdown::class)->delegatedModels($child->name, TimeRange::fromRequest(Illuminate\Http\Request::create('/')));
    expect((int) $delegated[0]->calls)->toBe(1)->and((int) $delegated[0]->unpriced)->toBe(1);
});

it('keeps an overflowing direct quantity unavailable after later small values', function () {
    $trace = Records::trace(['id' => 'overflow', 'status' => Status::Completed]);
    app(TraceStore::class)->store($trace, array_map(fn ($q) => Records::span($trace->id, ['type' => SpanType::Reranking, 'searchUnits' => $q]), ['999999999999.999999', '0.000001', '0.1']));
    $this->getJson('/trail/api/traces/overflow')->assertOk()->assertJsonPath('data.trace.usage.search_units', null);
});

it('keeps aggregate usage token-only and historical direct quantities null', function () {
    $trace = Records::trace(['id' => 'historical', 'status' => Status::Completed]);
    app(TraceStore::class)->store($trace, [Records::span($trace->id, ['inputTokens' => 10, 'cost' => 0.01])]);
    $this->getJson('/trail/api/traces/historical')->assertOk()->assertJsonPath('data.trace.usage.search_units', null)->assertJsonPath('data.trace.cost.amount', 0.01);
    $usage = $this->getJson('/trail/api/usage')->assertOk()->json('data.summary.usage');
    expect($usage)->not->toHaveKey('search_units');
});

it('preserves a quantity-bearing conversation turn through HTTP and the bounded MCP readers', function () {
    $trace = Records::trace(['id' => 'quantity-turn', 'status' => Status::Completed, 'conversationId' => 'quantity-conversation']);
    app(TraceStore::class)->store($trace, [Records::span($trace->id, ['type' => SpanType::Reranking, 'searchUnits' => '0.100001'])]);
    $http = $this->getJson('/trail/api/conversations/transcript?id=quantity-conversation')->assertOk()->json('data');
    expect($http['turns'][0]['trace']['usage']['search_units'])->toBe('0.100001')
        ->and($http['conversation']['usage'])->not->toHaveKey('search_units');
    $listed = app(TrailListTraces::class)->handle(new Request);
    $list = json_decode((string) $listed->content(), true, flags: JSON_THROW_ON_ERROR);
    expect($list['traces'][0]['usage']['search_units'])->toBe('0.100001')
        ->and($list['traces'][0])->not->toHaveKeys(['prompt_excerpt', 'response_excerpt', 'user']);
    $shown = app(TrailShowConversation::class)->handle(new Request(['id' => 'quantity-conversation']));
    $conversation = json_decode((string) $shown->content(), true, flags: JSON_THROW_ON_ERROR);
    expect($conversation['turns'][0]['usage']['search_units'])->toBe('0.100001')
        ->and($conversation['conversation']['usage'])->not->toHaveKey('search_units')
        ->and($conversation['turns'][0])->not->toHaveKeys(['input', 'output', 'metadata']);
});
