<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Agents\StructuredAgent;
use Astro\Trail\Tests\Fixtures\Capture\Captured;
use Astro\Trail\Tests\Fixtures\Capture\Steps;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Storage\DatabaseStoreProbe;
use Astro\Trail\Tests\Fixtures\Tools\CallbackTool;
use Astro\Trail\Tests\Fixtures\Tools\LookupTool;
use Laravel\Ai\Events\StepCompleted;
use Laravel\Ai\Events\ToolInvoked;
use Laravel\Ai\Responses\Data\ToolCall;

it('stores a run without tools as one trace with an agent span and one step', function () {
    AssistantAgent::fake(['Hello there']);

    $response = (new AssistantAgent)->prompt('Hi', model: FakeAnthropic::MODEL);
    Trail::flush();

    $run = Captured::read($response->invocationId)->assertVolatileColumns();

    // The SDK fake reports no usage, so nothing is priced and no token column holds a zero.
    expect($run->trace())->toBe(Captured::expectedTrace([
        'prompt_excerpt' => 'Hi',
        'response_excerpt' => 'Hello there',
        'agent_class' => AssistantAgent::class,
        'model' => FakeAnthropic::MODEL,
        'span_count' => 2,
    ]))->and($run->spans())->toBe([
        Captured::expectedSpan([
            'parent_id' => null,
            'type' => 'agent',
            'name' => 'AssistantAgent',
            'agent_class' => AssistantAgent::class,
            'sequence' => 1,
            'model' => FakeAnthropic::MODEL,
            'input' => ['prompt' => 'Hi', 'system' => 'You are a test assistant.'],
            'output' => ['text' => 'Hello there'],
        ]),
        Captured::expectedSpan([
            'sequence' => 2,
            'step_number' => 0,
            'model' => FakeAnthropic::MODEL,
            'responding_model' => FakeAnthropic::MODEL,
            'input' => Steps::promptOnly(),
            'output' => ['text' => 'Hello there', 'tool_calls' => [], 'finish_reason' => 'stop'],
        ]),
    ]);
});

it('stores a tool as a child of the agent span, with its arguments and result', function () {
    AssistantAgent::fake([new ToolCall('call_1', 'lookup', ['query' => 'laravel']), 'Done']);

    $response = (new AssistantAgent([new LookupTool]))->prompt('Hi', model: FakeAnthropic::MODEL);
    Trail::flush();

    $run = Captured::read($response->invocationId)->assertVolatileColumns();

    // Ids and timings are the SDK's own: Trail neither mints tool span ids nor re-measures steps and tools.
    $invoked = $this->sdk->sole(ToolInvoked::class)->event;
    $steps = array_map(fn ($entry) => $entry->event, $this->sdk->of(StepCompleted::class));
    $sdkIds = [$response->invocationId, $invoked->toolInvocationId, 'call_1'];

    expect($run->spanId(0))->toBe($response->invocationId)
        ->and($run->spanId(2))->toBe($invoked->toolInvocationId)
        ->and($run->duration(1))->toEqualWithDelta($steps[0]->time, 1e-6)
        ->and($run->duration(3))->toEqualWithDelta($steps[1]->time, 1e-6)
        ->and($run->duration(2))->toEqualWithDelta($invoked->time, 1e-6)
        ->and(array_intersect([$run->spanId(1), $run->spanId(3)], $sdkIds))->toBe([])
        ->and($run->spanId(1))->not->toBe($run->spanId(3));

    expect($run->trace())->toBe(Captured::expectedTrace([
        'prompt_excerpt' => 'Hi',
        'response_excerpt' => 'Done',
        'agent_class' => AssistantAgent::class,
        'model' => FakeAnthropic::MODEL,
        'span_count' => 4,
    ]))->and($run->spans())->toBe([
        Captured::expectedSpan([
            'parent_id' => null,
            'type' => 'agent',
            'name' => 'AssistantAgent',
            'agent_class' => AssistantAgent::class,
            'sequence' => 1,
            'model' => FakeAnthropic::MODEL,
            'input' => ['prompt' => 'Hi', 'system' => 'You are a test assistant.'],
            'output' => ['text' => 'Done'],
        ]),
        Captured::expectedSpan([
            'sequence' => 2,
            'step_number' => 0,
            'model' => FakeAnthropic::MODEL,
            'responding_model' => FakeAnthropic::MODEL,
            'input' => Steps::promptOnly(),
            'output' => [
                'text' => '',
                'tool_calls' => [['id' => 'call_1', 'name' => 'lookup', 'arguments' => ['query' => 'laravel']]],
                'finish_reason' => 'tool_calls',
            ],
        ]),
        Captured::expectedSpan([
            'type' => 'tool',
            'name' => 'lookup',
            'sequence' => 3,
            'provider' => null,
            'input' => ['arguments' => ['query' => 'laravel']],
            'output' => ['result' => 'Result for laravel'],
        ]),
        Captured::expectedSpan([
            'sequence' => 4,
            'step_number' => 1,
            'model' => FakeAnthropic::MODEL,
            'responding_model' => FakeAnthropic::MODEL,
            'input' => Steps::afterLookup('call_1', 'laravel'),
            'output' => ['text' => 'Done', 'tool_calls' => [], 'finish_reason' => 'stop'],
        ]),
    ]);
});

it('stores every tool call of one step in the order they ran', function () {
    FakeAnthropic::script([
        FakeAnthropic::toolUse([
            ['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'one']],
            ['id' => 'toolu_2', 'name' => 'lookup', 'input' => ['query' => 'two']],
        ]),
        FakeAnthropic::text('Done'),
    ]);

    $response = (new AssistantAgent([new LookupTool]))->prompt('Hi', model: FakeAnthropic::MODEL);
    Trail::flush();

    $run = Captured::read($response->invocationId)->assertVolatileColumns();
    $spans = $run->spans();

    expect(array_map(fn (array $span) => [$span['type'], $span['sequence'], $span['parent_id'], $span['step_number']], $spans))->toBe([
        ['agent', 1, null, null],
        ['step', 2, Captured::RUN, 0],
        ['tool', 3, Captured::RUN, null],
        ['tool', 4, Captured::RUN, null],
        ['step', 5, Captured::RUN, 1],
    ])->and([$spans[2]['input'], $spans[2]['output']])->toBe([['arguments' => ['query' => 'one']], ['result' => 'Result for one']])
        ->and([$spans[3]['input'], $spans[3]['output']])->toBe([['arguments' => ['query' => 'two']], ['result' => 'Result for two']])
        ->and($spans[1]['output']['tool_calls'])->toBe([
            ['id' => 'toolu_1', 'name' => 'lookup', 'arguments' => ['query' => 'one']],
            ['id' => 'toolu_2', 'name' => 'lookup', 'arguments' => ['query' => 'two']],
        ])->and($spans[4]['input']['messages'][2]['tool_results'])->toBe([
            ['id' => 'toolu_1', 'name' => 'lookup', 'result' => 'Result for one'],
            ['id' => 'toolu_2', 'name' => 'lookup', 'result' => 'Result for two'],
        ])->and($run->trace()['span_count'])->toBe(5);
});

it('numbers steps from zero across several tool rounds, all on attempt one', function () {
    AssistantAgent::fake([
        new ToolCall('call_1', 'lookup', ['query' => 'one']),
        new ToolCall('call_2', 'lookup', ['query' => 'two']),
        new ToolCall('call_3', 'lookup', ['query' => 'three']),
        'Done',
    ]);

    $response = (new AssistantAgent([new LookupTool, new LookupTool, new LookupTool]))->prompt('Hi', model: FakeAnthropic::MODEL);
    Trail::flush();

    $run = Captured::read($response->invocationId)->assertVolatileColumns();
    $spans = $run->spans();

    expect(array_map(fn (array $span) => [$span['type'], $span['sequence'], $span['step_number'], $span['attempt'], $span['status']], $spans))->toBe([
        ['agent', 1, null, 1, 'completed'],
        ['step', 2, 0, 1, 'completed'],
        ['tool', 3, null, 1, 'completed'],
        ['step', 4, 1, 1, 'completed'],
        ['tool', 5, null, 1, 'completed'],
        ['step', 6, 2, 1, 'completed'],
        ['tool', 7, null, 1, 'completed'],
        ['step', 8, 3, 1, 'completed'],
    ])->and($run->trace()['span_count'])->toBe(8)
        ->and(array_column(array_filter($spans, fn (array $span) => $span['type'] === 'tool'), 'input'))->toBe([
            ['arguments' => ['query' => 'one']],
            ['arguments' => ['query' => 'two']],
            ['arguments' => ['query' => 'three']],
        ]);
});

describe('structured output', function () {
    it('stores the structured data on the agent span for native structured output', function () {
        FakeAnthropic::script([FakeAnthropic::text('{"answer":"42"}')]);

        $response = (new StructuredAgent)->prompt('Hi', model: FakeAnthropic::MODEL);
        Trail::flush();

        $run = Captured::read($response->invocationId)->assertVolatileColumns();

        expect($run->trace())->toBe(Captured::expectedTrace([
            'prompt_excerpt' => 'Hi',
            'response_excerpt' => '{"answer":"42"}',
            'name' => 'StructuredAgent',
            'agent_class' => StructuredAgent::class,
            'model' => FakeAnthropic::MODEL,
            'span_count' => 2,
            'input_tokens' => 10,
            'output_tokens' => 5,
            'unpriced_span_count' => 1,
        ]))->and($run->spans()[0]['output'])->toBe(['text' => '{"answer":"42"}', 'structured' => ['answer' => '42']])
            ->and($run->spans()[1]['output'])->toBe([
                'text' => '{"answer":"42"}',
                'tool_calls' => [],
                'finish_reason' => 'stop',
                'structured' => ['answer' => '42'],
            ]);
    });

    it('stores no tool span for the synthetic tool', function () {
        config(['ai.providers.anthropic.use_native_structured_output' => false]);

        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'output_structured_data', 'input' => ['answer' => '42']]]),
        ]);

        $response = (new StructuredAgent)->prompt('Hi', model: FakeAnthropic::MODEL);
        Trail::flush();

        $run = Captured::read($response->invocationId)->assertVolatileColumns();
        $spans = $run->spans();

        expect(array_column($spans, 'type'))->toBe(['agent', 'step'])
            ->and($run->trace()['span_count'])->toBe(2)
            ->and($spans[0]['output']['structured'])->toBe(['answer' => '42'])
            ->and($spans[1]['output']['structured'])->toBe(['answer' => '42'])
            ->and($spans[1]['output']['tool_calls'])->toBe([]);
    });
});

describe('with provider usage', function () {
    beforeEach(function () {
        config(['trail.pricing.anthropic' => [
            'claude-test-requested' => ['input' => 3.0, 'output' => 15.0, 'cache_read' => 0.30, 'cache_write' => 3.75],
            'claude-test-responding' => ['input' => 10.0, 'output' => 50.0, 'cache_read' => 1.0, 'cache_write' => 12.5],
        ]]);

        FakeAnthropic::script([
            FakeAnthropic::toolUse(
                [['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'laravel']]],
                usage: ['input_tokens' => 100, 'output_tokens' => 20, 'cache_read_input_tokens' => 40, 'cache_creation_input_tokens' => 8],
            ),
            FakeAnthropic::text('Done', usage: ['input_tokens' => 7, 'output_tokens' => 3], model: 'claude-test-responding'),
        ]);
    });

    it('stores usage as reported and prices each step at the model that answered', function () {
        $response = (new AssistantAgent([new LookupTool]))->prompt('Hi', model: FakeAnthropic::MODEL);
        Trail::flush();

        $run = Captured::read($response->invocationId)->assertVolatileColumns();
        $spans = $run->spans();

        // Step 0: 100 uncached x 3 + 20 x 15 + 40 read x 0.30 + 8 written x 3.75, per million tokens.
        // Step 1 answered as claude-test-responding: 7 x 10 + 3 x 50, per million tokens (at the requested model's rates it would be 0.000066).
        expect($run->trace())->toBe(Captured::expectedTrace([
            'prompt_excerpt' => 'Hi',
            'response_excerpt' => 'Done',
            'agent_class' => AssistantAgent::class,
            'model' => FakeAnthropic::MODEL,
            'input_tokens' => 155,
            'output_tokens' => 23,
            'cache_read_tokens' => 40,
            'cache_write_tokens' => 8,
            'reasoning_tokens' => null,
            'cost' => 0.000862,
            'span_count' => 4,
            'unpriced_span_count' => 0,
        ]))->and($spans[1])->toBe(Captured::expectedSpan([
            'sequence' => 2,
            'step_number' => 0,
            'model' => FakeAnthropic::MODEL,
            'responding_model' => FakeAnthropic::MODEL,
            'input_tokens' => 148,
            'output_tokens' => 20,
            'cache_read_tokens' => 40,
            'cache_write_tokens' => 8,
            'reasoning_tokens' => null,
            'cost' => 0.000642,
            'input' => Steps::promptOnly(),
            'output' => [
                'text' => '',
                'tool_calls' => [['id' => 'toolu_1', 'name' => 'lookup', 'arguments' => ['query' => 'laravel']]],
                'finish_reason' => 'tool_calls',
            ],
        ]))->and($spans[3])->toBe(Captured::expectedSpan([
            'sequence' => 4,
            'step_number' => 1,
            'model' => FakeAnthropic::MODEL,
            'responding_model' => 'claude-test-responding',
            'input_tokens' => 7,
            'output_tokens' => 3,
            'cache_read_tokens' => null,
            'cache_write_tokens' => null,
            'reasoning_tokens' => null,
            'cost' => 0.00022,
            'input' => Steps::afterLookup('toolu_1', 'laravel'),
            'output' => ['text' => 'Done', 'tool_calls' => [], 'finish_reason' => 'stop'],
        ]))->and([$spans[0]['cost'], $spans[2]['cost']])->toBe([null, null]);
    });

    it('leaves a step unpriced, not free, when its model has no price', function () {
        config(['trail.pricing.anthropic' => ['claude-test-requested' => ['input' => 3.0, 'output' => 15.0, 'cache_read' => 0.30, 'cache_write' => 3.75]]]);

        $response = (new AssistantAgent([new LookupTool]))->prompt('Hi', model: FakeAnthropic::MODEL);
        Trail::flush();

        $run = Captured::read($response->invocationId);
        $spans = $run->spans();

        // Step 1 answered as claude-test-responding, which has no price here.
        expect($spans[1]['cost'])->toBe('0.0006420000')
            ->and($spans[3]['cost'])->toBeNull()
            ->and($spans[3]['input_tokens'])->toBe(7)
            ->and($run->trace()['cost'])->toBe('0.0006420000')
            ->and($run->trace()['unpriced_span_count'])->toBe(1);
    });

    it('reports a step as unpriced when no price is configured for its model', function () {
        config(['trail.pricing.anthropic' => ['some-other-model' => ['input' => 1.0, 'output' => 1.0]]]);

        $response = (new AssistantAgent([new LookupTool]))->prompt('Hi', model: FakeAnthropic::MODEL);
        Trail::flush();

        $run = Captured::read($response->invocationId);

        expect(array_column($run->spans(), 'cost'))->toBe([null, null, null, null])
            ->and($run->trace()['cost'])->toBeNull()
            ->and($run->trace()['input_tokens'])->toBe(155)
            ->and($run->trace()['unpriced_span_count'])->toBe(2);
    });
});

it('stores an anonymous agent without its class name', function () {
    FakeAnthropic::script([FakeAnthropic::text('Hello')]);

    $response = (new class extends AssistantAgent {})->prompt('Hi', model: FakeAnthropic::MODEL);
    Trail::flush();

    $run = Captured::read($response->invocationId)->assertVolatileColumns();

    expect($run->trace()['agent_class'])->toBeNull()
        ->and($run->trace()['name'])->toBe('Anonymous agent')
        ->and($run->spans()[0]['agent_class'])->toBeNull()
        ->and($run->spans()[0]['name'])->toBe('Anonymous agent')
        ->and(json_encode([$run->trace(), $run->spans()], JSON_THROW_ON_ERROR))->not->toContain('anonymous')->not->toContain('\u0000');
});

it('keeps two runs in one process apart and holds nothing after a flush', function () {
    AssistantAgent::fake(['one', 'two']);

    $first = (new AssistantAgent)->prompt('First', model: FakeAnthropic::MODEL);
    $second = (new AssistantAgent)->prompt('Second', model: FakeAnthropic::MODEL);

    Trail::flush();

    $one = Captured::read($first->invocationId)->assertVolatileColumns();
    $two = Captured::read($second->invocationId)->assertVolatileColumns();

    expect($first->invocationId)->not->toBe($second->invocationId)
        ->and([$one->spans()[0]['input']['prompt'], $one->spans()[0]['output']['text']])->toBe(['First', 'one'])
        ->and([$two->spans()[0]['input']['prompt'], $two->spans()[0]['output']['text']])->toBe(['Second', 'two'])
        ->and(array_column($one->spans(), 'sequence'))->toBe([1, 2])
        ->and(array_column($two->spans(), 'sequence'))->toBe([1, 2])
        ->and([$one->trace()['span_count'], $two->trace()['span_count']])->toBe([2, 2]);

    $queries = 0;
    DB::listen(function () use (&$queries) {
        $queries++;
    });

    Trail::flush();

    expect($queries)->toBe(0)
        ->and((new DatabaseStoreProbe)->traceCount())->toBe(2);
});

it('writes a trace that is still running when flushed, and ignores what the run fires afterwards', function () {
    $tool = new CallbackTool('lookup', function () {
        Trail::flush();

        return 'Flushed';
    });

    AssistantAgent::fake([new ToolCall('call_1', 'lookup', ['query' => 'x']), 'Done']);

    $response = (new AssistantAgent([$tool]))->prompt('Hi', model: FakeAnthropic::MODEL);

    $run = Captured::read($response->invocationId);
    $spans = $run->spans();

    expect($response->text)->toBe('Done')
        ->and($run->trace()['status'])->toBe('running')
        ->and(array_column($spans, 'type'))->toBe(['agent', 'step', 'tool'])
        ->and(array_column($spans, 'status'))->toBe(['running', 'completed', 'running'])
        ->and($spans[0]['output'])->toBeNull();
});
