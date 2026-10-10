<?php

use Astro\Trail\Enums\ErrorSource;
use Astro\Trail\Enums\IssueKind;
use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Queries\TraceDetail;
use Astro\Trail\Queries\TraceId;
use Astro\Trail\Storage\Models\Span;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Agents\ManyStepsAgent;
use Astro\Trail\Tests\Fixtures\Agents\ResearcherAgent;
use Astro\Trail\Tests\Fixtures\Agents\StructuredAgent;
use Astro\Trail\Tests\Fixtures\Agents\SummarizerAgent;
use Astro\Trail\Tests\Fixtures\Capture\Approvals;
use Astro\Trail\Tests\Fixtures\Capture\Failures;
use Astro\Trail\Tests\Fixtures\Capture\Secrets;
use Astro\Trail\Tests\Fixtures\Capture\Streams;
use Astro\Trail\Tests\Fixtures\Conversations\ConversationParticipant;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Storage\Rows;
use Astro\Trail\Tests\Fixtures\Tools\ApprovalTool;
use Astro\Trail\Tests\Fixtures\Tools\CallbackTool;
use Astro\Trail\Tests\Fixtures\Tools\LookupTool;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Http;
use Laravel\Ai\Approvals\Decisions;
use Laravel\Ai\Embeddings;
use Laravel\Ai\Events\AgentFailed;
use Laravel\Ai\Events\GeneratingEmbeddings;
use Laravel\Ai\Exceptions\RateLimitedException;

/*
|--------------------------------------------------------------------------
| The response behind the page of one run
|--------------------------------------------------------------------------
|
| Runs are recorded through the real capture layer where it can produce the state, and written
| as rows where it cannot (a stale run, exact numbers, a span limit).
|
*/

beforeEach(function () {
    $this->app['env'] = 'local';

    // The sub-agents of these runs ask for no model, so they are priced at the SDK's default one.
    config(['trail.pricing.anthropic' => [
        FakeAnthropic::MODEL => ['input' => 3.0, 'output' => 15.0],
        'claude-sonnet-5-5' => ['input' => 3.0, 'output' => 15.0],
    ]]);

    /** The response for the first run the SDK saw, or for the given run id. */
    $this->shown = function (?string $id = null): array {
        Trail::flush();

        return $this->getJson('/trail/api/traces/'.($id ?? $this->sdk->invocationIds()[0]))->assertOk()->json();
    };
});

afterEach(function () {
    Carbon::setTestNow();
    // Some tests change the environment; a failed assertion must not leave it changed.
    $this->app['env'] = 'testing';
});

/**
 * The spans of a response by type, in the order they are returned.
 *
 * @param  array<string, mixed>  $body
 * @return list<array<string, mixed>>
 */
function traceShowSpansOfType(array $body, string $type): array
{
    return array_values(array_filter($body['data']['spans'], fn (array $span) => $span['type'] === $type));
}

/**
 * The (type, attempt, step number, status) of every span, for reading a run at a glance.
 *
 * @param  array<string, mixed>  $body
 * @return list<array{string, int, ?int, string}>
 */
function traceShowOutline(array $body): array
{
    return array_map(fn (array $span) => [$span['type'], $span['attempt'], $span['step_number'], $span['status']], $body['data']['spans']);
}

describe('a recorded run', function () {
    it('shows a plain run with its agent and its step', function () {
        FakeAnthropic::script([FakeAnthropic::text('Hello', usage: ['input_tokens' => 100, 'output_tokens' => 20])]);

        (new AssistantAgent)->prompt('Hi', model: FakeAnthropic::MODEL);
        $body = ($this->shown)();
        $data = $body['data'];

        expect(array_keys($body))->toBe(['data', 'span_limit'])
            ->and(array_keys($data))->toBe(['trace', 'detail', 'spans', 'usage', 'coverage'])
            ->and($body['span_limit'])->toBe(['limit' => 2000, 'total' => 2, 'truncated' => false])
            ->and($data['trace']['id'])->toBe($this->sdk->invocationIds()[0])
            ->and($data['trace']['span_count'])->toBe(2)
            ->and($data['detail'])->toBe(['error' => null, 'pending_approvals' => [], 'resolved_tool_call_ids' => []]);

        [$agent, $step] = $data['spans'];

        expect($agent)->toMatchArray([
            'id' => $data['trace']['id'], 'parent_id' => null, 'type' => 'agent', 'name' => 'AssistantAgent',
            'agent_class' => AssistantAgent::class, 'status' => 'completed', 'attempt' => 1, 'step_number' => null,
            'offset_ms' => 0, 'usage' => null, 'cost' => null, 'error' => null, 'redacted' => false, 'truncated' => false,
        ])->and($agent['input'])->toMatchArray(['prompt' => 'Hi', 'system' => 'You are a test assistant.'])
            ->and($agent['output'])->toBe(['text' => 'Hello'])
            ->and($step)->toMatchArray([
                'parent_id' => $agent['id'], 'type' => 'step', 'name' => 'step', 'agent_class' => null, 'status' => 'completed',
                'attempt' => 1, 'step_number' => 0, 'provider' => 'anthropic', 'model' => FakeAnthropic::MODEL,
                'responding_model' => FakeAnthropic::MODEL, 'error' => null,
            ])->and($step['usage'])->toBe([
                'state' => 'reported', 'input_tokens' => 100, 'output_tokens' => 20, 'cache_read_tokens' => null,
                'cache_write_tokens' => null, 'reasoning_tokens' => null, 'total_tokens' => 120,
            ])->and($step['cost'])->toBe(['state' => 'estimated', 'amount' => 0.0006])
            ->and($step['duration_ms'])->toBeFloat()
            ->and($step['offset_ms'])->toBeInt()
            ->and($step['output']['text'])->toBe('Hello');

        expect($data['usage']['totals'])->toBe(['usage' => $data['trace']['usage'], 'cost' => $data['trace']['cost']])
            ->and($data['usage']['rows'])->toBe([[
                'span_id' => $step['id'], 'agent_span_id' => $agent['id'], 'type' => 'step', 'name' => 'step', 'attempt' => 1,
                'step_number' => 0, 'provider' => 'anthropic', 'model' => FakeAnthropic::MODEL, 'usage' => $step['usage'], 'cost' => $step['cost'],
            ]])->and($data['usage']['agents'])->toBe([[
                'span_id' => $agent['id'], 'name' => 'AssistantAgent', 'usage' => $step['usage'], 'cost' => $step['cost'],
            ]]);

        foreach ($data['coverage'] as $item) {
            expect($item)->toBe(['state' => 'captured', 'captured' => $item['expected'], 'expected' => $item['expected'], 'reason' => null]);
        }

        expect(array_column($data['coverage'], 'expected'))->toBe([2, 1, 1, 1, 1, 2]);
    });

    it('shows several steps and tools in the order they were recorded', function () {
        FakeAnthropic::script([
            FakeAnthropic::toolUse([
                ['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'a']],
                ['id' => 'toolu_2', 'name' => 'lookup', 'input' => ['query' => 'b']],
            ], usage: ['input_tokens' => 100, 'output_tokens' => 20]),
            FakeAnthropic::toolUse([['id' => 'toolu_3', 'name' => 'lookup', 'input' => ['query' => 'c']]], usage: ['input_tokens' => 50, 'output_tokens' => 10]),
            FakeAnthropic::text('Done', usage: ['input_tokens' => 30, 'output_tokens' => 5]),
        ]);

        (new ManyStepsAgent([new LookupTool]))->prompt('Hi', model: FakeAnthropic::MODEL);
        $body = ($this->shown)();
        $spans = $body['data']['spans'];

        expect(array_column($spans, 'type'))->toBe(['agent', 'step', 'tool', 'tool', 'step', 'tool', 'step'])
            ->and(array_column($spans, 'sequence'))->toBe([1, 2, 3, 4, 5, 6, 7])
            ->and(array_column($spans, 'step_number'))->toBe([null, 0, null, null, 1, null, 2])
            ->and(array_unique(array_column(array_slice($spans, 1), 'parent_id')))->toBe([$spans[0]['id']])
            ->and(array_column(traceShowSpansOfType($body, 'tool'), 'name'))->toBe(['lookup', 'lookup', 'lookup'])
            ->and(traceShowSpansOfType($body, 'tool')[0]['input'])->toBe(['arguments' => ['query' => 'a']])
            ->and(traceShowSpansOfType($body, 'tool')[0]['output'])->toBe(['result' => 'Result for a'])
            ->and(traceShowSpansOfType($body, 'tool')[0]['usage'])->toBeNull()
            ->and(traceShowSpansOfType($body, 'tool')[0]['cost'])->toBeNull()
            ->and($body['data']['trace']['usage']['input_tokens'])->toBe(180)
            ->and(array_column($body['data']['usage']['rows'], 'step_number'))->toBe([0, 1, 2])
            ->and($body['data']['trace']['span_count'])->toBe(7);
    });

    it('shows a failed run with its error on the run, the agent and the step', function () {
        FakeAnthropic::script([FakeAnthropic::error(500, 'Server error')]);

        Failures::thrown(fn () => (new AssistantAgent)->prompt('Hi', model: FakeAnthropic::MODEL));
        $message = $this->sdk->sole(AgentFailed::class)->event->exception->getMessage();
        $body = ($this->shown)();
        $error = ['class' => RequestException::class, 'message' => $message, 'source' => 'step', 'http_status' => 500];

        expect($message)->not->toBe('')
            ->and($body['data']['trace'])->toMatchArray(['status' => 'failed', 'issue_kind' => 'exception'])
            ->and($body['data']['detail']['error'])->toBe($error)
            ->and(traceShowOutline($body))->toBe([['agent', 1, null, 'failed'], ['step', 1, 0, 'failed']])
            ->and(array_column($body['data']['spans'], 'error'))->toBe([$error, $error])
            ->and($body['data']['spans'][1]['usage']['state'])->toBe('not_reported')
            ->and($body['data']['spans'][1]['cost'])->toBe(['state' => 'not_captured', 'amount' => null])
            ->and($body['data']['usage']['totals']['cost'])->toBe(['state' => 'not_captured', 'amount' => null]);
    });

    it('keeps the error of the failed attempt of a failover on its step, and numbers the steps again', function () {
        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'a']]]),
            FakeAnthropic::error(429, 'Slow down'),
            FakeAnthropic::text('ok'),
        ]);

        (new AssistantAgent([new LookupTool]))->prompt('Hi', provider: ['anthropic' => 'model-a', 'backup' => 'model-b']);
        $body = ($this->shown)();
        $failed = $body['data']['spans'][3];

        expect($body['data']['trace'])->toMatchArray(['status' => 'completed', 'recovered' => true, 'model' => 'model-b'])
            ->and($body['data']['detail']['error'])->toBeNull()
            ->and(traceShowOutline($body))->toBe([
                ['agent', 2, null, 'completed'],
                ['step', 1, 0, 'completed'],
                ['tool', 1, null, 'completed'],
                ['step', 1, 1, 'failed'],
                ['step', 2, 0, 'completed'],
            ])
            ->and(array_column($body['data']['spans'], 'model'))->toBe(['model-b', 'model-a', null, 'model-a', 'model-b'])
            ->and($failed['error'])->toMatchArray(['class' => RateLimitedException::class, 'source' => 'step', 'http_status' => 429])
            ->and($failed['issue_kind'])->toBe('rate_limited')
            ->and($failed['usage'])->toMatchArray(['state' => 'not_reported', 'input_tokens' => null])
            ->and($failed['cost'])->toBe(['state' => 'not_captured', 'amount' => null])
            ->and(array_column($body['data']['usage']['rows'], 'attempt'))->toBe([1, 1, 2])
            ->and($body['data']['coverage']['usage'])->toBe(['state' => 'captured', 'captured' => 2, 'expected' => 2, 'reason' => null]);
    });

    it('shows a streamed run without the model that answered, and says why', function () {
        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'x']]], usage: ['input_tokens' => 100, 'output_tokens' => 20]),
            FakeAnthropic::text('Done', usage: ['input_tokens' => 7, 'output_tokens' => 3], model: 'claude-test-responding'),
        ]);

        Streams::drain((new AssistantAgent([new LookupTool]))->stream('Hi', model: FakeAnthropic::MODEL));
        $body = ($this->shown)();
        $steps = traceShowSpansOfType($body, 'step');

        expect($body['data']['trace']['streamed'])->toBeTrue()
            ->and($steps)->toHaveCount(2)
            ->and(array_column($steps, 'model'))->toBe([FakeAnthropic::MODEL, FakeAnthropic::MODEL])
            ->and(array_column($steps, 'responding_model'))->toBe([null, null])
            ->and($body['data']['coverage']['responding_model'])->toBe(['state' => 'not_captured', 'captured' => 0, 'expected' => 2, 'reason' => 'streamed'])
            ->and($body['data']['coverage']['usage']['state'])->toBe('captured');
    });

    it('links a delegation two levels deep and gives each agent its own subtotal', function () {
        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'ResearcherAgent', 'input' => ['task' => 'Dig']]], usage: ['input_tokens' => 100, 'output_tokens' => 20]),
            FakeAnthropic::toolUse([['id' => 'toolu_2', 'name' => 'SummarizerAgent', 'input' => ['task' => 'Condense']]], usage: ['input_tokens' => 50, 'output_tokens' => 10]),
            FakeAnthropic::text('summary', usage: ['input_tokens' => 10, 'output_tokens' => 5]),
            FakeAnthropic::text('found it', usage: ['input_tokens' => 5, 'output_tokens' => 2]),
            FakeAnthropic::text('Done', usage: ['input_tokens' => 7, 'output_tokens' => 3]),
        ]);

        (new AssistantAgent([new ResearcherAgent([new SummarizerAgent])]))->prompt('Hi', model: FakeAnthropic::MODEL);
        $body = ($this->shown)();
        $spans = $body['data']['spans'];
        [$root, $rootStep, $toolOne, $child, $childStep, $toolTwo, $grandchild, $grandchildStep, $childLast, $rootLast] = $spans;

        expect(array_column($spans, 'type'))->toBe(['agent', 'step', 'tool', 'agent', 'step', 'tool', 'agent', 'step', 'step', 'step'])
            ->and(array_column($spans, 'name'))->toBe(['AssistantAgent', 'step', 'ResearcherAgent', 'ResearcherAgent', 'step', 'SummarizerAgent', 'SummarizerAgent', 'step', 'step', 'step'])
            ->and($child['parent_id'])->toBe($toolOne['id'])
            ->and($toolOne['parent_id'])->toBe($root['id'])
            ->and($grandchild['parent_id'])->toBe($toolTwo['id'])
            ->and($toolTwo['parent_id'])->toBe($child['id'])
            ->and($childStep['parent_id'])->toBe($child['id'])
            ->and($grandchildStep['parent_id'])->toBe($grandchild['id']);

        $agentOf = array_column($body['data']['usage']['rows'], 'agent_span_id', 'span_id');

        expect($agentOf)->toBe([
            $rootStep['id'] => $root['id'],
            $childStep['id'] => $child['id'],
            $grandchildStep['id'] => $grandchild['id'],
            $childLast['id'] => $child['id'],
            $rootLast['id'] => $root['id'],
        ]);

        // Each agent's subtotal leaves out the agents it delegated to, so the three add up to the run.
        $subtotals = array_column($body['data']['usage']['agents'], null, 'span_id');
        $input = fn (string $id) => $subtotals[$id]['usage']['input_tokens'];
        $amount = fn (string $id) => round($subtotals[$id]['cost']['amount'], 10);

        expect(array_keys($subtotals))->toBe([$root['id'], $child['id'], $grandchild['id']])
            ->and([$input($root['id']), $input($child['id']), $input($grandchild['id'])])->toBe([107, 55, 10])
            ->and([$amount($root['id']), $amount($child['id']), $amount($grandchild['id'])])->toBe([0.000666, 0.000345, 0.000105])
            ->and($body['data']['trace']['usage']['input_tokens'])->toBe(172)
            ->and(round($body['data']['trace']['cost']['amount'], 10))->toBe(0.001116)
            ->and(array_column($subtotals, 'cost'))->each(fn ($cost) => $cost->state->toBe('estimated'));
    });

    it('shows a sub-agent that failed under a run that carried on', function () {
        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'ResearcherAgent', 'input' => ['task' => 'Dig']]]),
            FakeAnthropic::error(500, 'Server error'),
            FakeAnthropic::text('Done'),
        ]);

        (new AssistantAgent([new ResearcherAgent]))->prompt('Hi', model: FakeAnthropic::MODEL);
        $body = ($this->shown)();
        [$root, , $tool, $child, $childStep] = $body['data']['spans'];

        expect($body['data']['trace'])->toMatchArray(['status' => 'completed', 'child_failed' => true])
            ->and($body['data']['detail']['error'])->toBeNull()
            ->and($root['error'])->toBeNull()
            ->and($tool['status'])->toBe('completed')
            ->and($tool['output']['result'])->toStartWith('Agent failed: ')
            ->and($child)->toMatchArray(['type' => 'agent', 'status' => 'failed', 'parent_id' => $tool['id']])
            ->and($child['error'])->toMatchArray(['class' => RequestException::class, 'source' => 'step', 'http_status' => 500])
            ->and($childStep['error'])->toBe($child['error']);
    });

    it('shows a run that paused for approval, and the run that resumed it', function () {
        $user = new ConversationParticipant;
        FakeAnthropic::script([Approvals::turn()]);

        $paused = Approvals::agent([(new ApprovalTool)->requireApproval('Deletes data')], $user)->prompt('Delete the users', model: FakeAnthropic::MODEL);
        $body = ($this->shown)($paused->invocationId);

        expect($body['data']['trace']['status'])->toBe('awaiting_approval')
            ->and($body['data']['detail'])->toBe([
                'error' => null,
                'pending_approvals' => [['tool_call_id' => 'toolu_1', 'tool' => 'delete_records', 'arguments' => ['table' => 'users'], 'reason' => 'Deletes data']],
                'resolved_tool_call_ids' => [],
            ])
            ->and(array_column($body['data']['spans'], 'status'))->toBe(['awaiting_approval', 'completed']);

        FakeAnthropic::script([FakeAnthropic::text('Deleted them')]);

        $resumed = Approvals::agent([new ApprovalTool], $user, $paused->conversationId)->prompt(Decisions::from(['toolu_1' => true]), model: FakeAnthropic::MODEL);
        $body = ($this->shown)($resumed->invocationId);

        expect($body['data']['trace']['status'])->toBe('completed')
            ->and($body['data']['detail'])->toBe(['error' => null, 'pending_approvals' => [], 'resolved_tool_call_ids' => ['toolu_1']])
            ->and(array_column($body['data']['spans'], 'type'))->toBe(['agent', 'tool', 'step'])
            ->and(traceShowSpansOfType($body, 'tool')[0]['output'])->toBe(['result' => 'Deleted users']);
    });

    it('shows structured output on the agent and has no tool span for it', function () {
        FakeAnthropic::script([FakeAnthropic::text('{"answer":"42"}')]);

        (new StructuredAgent)->prompt('Hi', model: FakeAnthropic::MODEL);
        $body = ($this->shown)();
        [$agent, $step] = $body['data']['spans'];

        expect(array_column($body['data']['spans'], 'type'))->toBe(['agent', 'step'])
            ->and($agent['output']['structured'])->toBe(['answer' => '42'])
            ->and($step['output'])->toHaveKey('structured')
            ->and($body['data']['usage']['rows'])->toHaveCount(1);
    });

    it('shows an embeddings call made inside a tool under that tool, billed as its own row', function () {
        config(['trail.pricing.openai' => ['text-embedding-3-small' => ['input' => 2.0]]]);
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
        $body = ($this->shown)();
        [$agent, , $tool, $embedding] = $body['data']['spans'];

        expect(array_column($body['data']['spans'], 'type'))->toBe(['agent', 'step', 'tool', 'embedding', 'step'])
            ->and($embedding)->toMatchArray(['parent_id' => $tool['id'], 'name' => 'embeddings', 'provider' => 'openai', 'model' => 'text-embedding-3-small'])
            ->and($embedding['input'])->toBe(['count' => 2, 'dimensions' => 1536])
            ->and($embedding['output'])->toBe(['count' => 2])
            ->and($embedding['usage'])->toMatchArray(['state' => 'reported', 'input_tokens' => 7, 'output_tokens' => null])
            ->and($embedding['cost'])->toBe(['state' => 'estimated', 'amount' => 0.000014])
            ->and($tool['usage'])->toBeNull();

        $row = array_values(array_filter($body['data']['usage']['rows'], fn (array $row) => $row['type'] === 'embedding'))[0];

        expect($row)->toMatchArray(['span_id' => $embedding['id'], 'agent_span_id' => $agent['id'], 'step_number' => null])
            ->and($body['data']['trace']['usage']['input_tokens'])->toBe(114);
    });

    it('shows an embeddings call on its own as a run with one span and no agent', function () {
        config(['trail.pricing.openai' => ['text-embedding-3-small' => ['input' => 2.0]]]);
        Http::fake(['api.openai.com/*' => Http::response([
            'data' => [['embedding' => [0.1, 0.2]]],
            'usage' => ['prompt_tokens' => 7, 'total_tokens' => 7],
        ])]);

        Embeddings::for(['a'])->generate();
        $body = ($this->shown)($this->sdk->sole(GeneratingEmbeddings::class)->invocationId);

        expect($body['data']['trace'])->toMatchArray(['type' => 'embedding', 'name' => 'Embeddings', 'agent_class' => null, 'span_count' => 1])
            ->and($body['data']['spans'])->toHaveCount(1)
            ->and($body['data']['spans'][0])->toMatchArray(['type' => 'embedding', 'parent_id' => null])
            ->and($body['data']['usage']['rows'])->toHaveCount(1)
            ->and($body['data']['usage']['rows'][0]['agent_span_id'])->toBeNull()
            ->and($body['data']['usage']['agents'])->toBe([])
            ->and($body['data']['usage']['totals']['cost'])->toBe($body['data']['spans'][0]['cost'])
            ->and($body['data']['coverage']['system_prompt'])->toBe(['state' => 'not_applicable', 'captured' => 0, 'expected' => 0, 'reason' => null])
            ->and($body['data']['coverage']['responding_model']['state'])->toBe('not_applicable');
    });

    it('shows what capture cut short, with the original length, and no list of paths in the metadata', function () {
        config(['trail.capture.max_length' => 50]);
        FakeAnthropic::script([FakeAnthropic::text('ok')]);

        (new AssistantAgent)->prompt(str_repeat('abcdefghij', 12), model: FakeAnthropic::MODEL);
        $body = ($this->shown)();
        [$agent, $step] = $body['data']['spans'];

        expect($agent['input']['prompt'])->toBe(str_repeat('abcdefghij', 5))
            ->and($agent['truncated'])->toBeTrue()
            ->and($agent['truncated_paths'])->toBe(['input.prompt' => 120])
            ->and($agent['metadata'])->toBeNull()
            ->and($step['truncated_paths'])->toBe(['input.messages.0.content' => 120])
            ->and($step['metadata'])->toBeNull();
    });

    it('shows what capture redacted, marked in place', function () {
        FakeAnthropic::script([FakeAnthropic::text('ok')]);

        (new AssistantAgent)->prompt('My key is '.Secrets::PROMPT.' please remember it', model: FakeAnthropic::MODEL);
        $body = ($this->shown)();
        [$agent] = $body['data']['spans'];

        expect($agent['redacted'])->toBeTrue()
            ->and($agent['input']['prompt'])->toBe('My key is [redacted] please remember it')
            ->and($agent['truncated'])->toBeFalse()
            ->and($agent['truncated_paths'])->toBe([]);
    });

    it('shows the same run in the list and on its page', function () {
        FakeAnthropic::script([FakeAnthropic::text('Hello')]);

        (new AssistantAgent)->prompt('Hi', model: FakeAnthropic::MODEL);
        $shown = ($this->shown)();
        Trace::query()->whereKey($shown['data']['trace']['id'])->firstOrFail()->bookmark()->create([]);

        $listed = $this->getJson('/trail/api/traces')->assertOk()->json('data.0');
        $page = $this->getJson('/trail/api/traces/'.$listed['id'])->assertOk()->json('data.trace');

        expect($listed['bookmarked'])->toBeTrue()
            ->and($shown['data']['trace']['bookmarked'])->toBeFalse()
            ->and($page)->toBe($listed)
            ->and(array_keys($page))->not->toContain('error', 'metadata');
    });
});

describe('a run written as rows', function () {
    beforeEach(function () {
        Carbon::setTestNow('2026-01-02 12:00:00');
    });

    /**
     * @param  array<string, mixed>  $attributes
     */
    function traceShowRun(array $attributes = []): Trace
    {
        return Rows::trace([...['id' => 'trace-1', 'status' => Status::Completed, 'started_at' => '2026-01-02 11:00:00'], ...$attributes]);
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    function traceShowSpan(Trace $trace, int $sequence, array $attributes = []): Span
    {
        return Rows::span($trace, [...[
            'id' => "span-{$sequence}", 'sequence' => $sequence, 'status' => Status::Completed,
            'started_at' => '2026-01-02 11:00:00', 'ended_at' => '2026-01-02 11:00:01', 'duration_ms' => 1000.0,
        ], ...$attributes]);
    }

    function traceShowRows(mixed $test, string $id = 'trace-1'): array
    {
        return $test->getJson("/trail/api/traces/{$id}")->assertOk()->json();
    }

    it('shapes a fully populated span key for key', function () {
        $trace = traceShowRun(['input_tokens' => 120, 'output_tokens' => 30, 'cost' => 0.0006]);
        traceShowSpan($trace, 1, ['type' => SpanType::Agent, 'name' => 'Support', 'agent_class' => 'App\\Ai\\Support']);
        traceShowSpan($trace, 2, [
            'parent_id' => 'span-1',
            'type' => SpanType::Step,
            'name' => 'step',
            'attempt' => 2,
            'step_number' => 3,
            'provider' => 'anthropic',
            'model' => 'claude-a',
            'responding_model' => 'claude-b',
            'input_tokens' => 120,
            'output_tokens' => 30,
            'cache_read_tokens' => 4,
            'cache_write_tokens' => 5,
            'reasoning_tokens' => 6,
            'cost' => 0.0006,
            'status' => Status::Failed,
            'issue_kind' => IssueKind::RateLimited,
            'error_class' => 'RateLimitedException',
            'error_message' => 'Slow down',
            'error_source' => ErrorSource::Step,
            'error_http_status' => 429,
            'input' => ['messages' => [['role' => 'user', 'content' => 'Hi']], 'messages_offset' => 0, 'options' => null],
            'output' => ['text' => 'No', 'tool_calls' => [], 'finish_reason' => 'stop'],
            'metadata' => ['truncated' => ['input.messages.0.content' => 12000], 'note' => 'kept'],
            'redacted' => true,
            'truncated' => true,
            'started_at' => '2026-01-02 11:00:00.250',
            'ended_at' => '2026-01-02 11:00:01.500',
            'duration_ms' => 1250.5,
        ]);

        $span = traceShowRows($this)['data']['spans'][1];

        expect(array_keys($span))->toBe([
            'id', 'parent_id', 'type', 'name', 'agent_class', 'status', 'issue_kind', 'attempt', 'sequence', 'step_number',
            'provider', 'model', 'responding_model', 'duration_ms', 'offset_ms', 'started_at', 'ended_at', 'usage', 'cost',
            'error', 'input', 'output', 'metadata', 'redacted', 'truncated', 'truncated_paths',
        ])->and($span)->toBe([
            'id' => 'span-2',
            'parent_id' => 'span-1',
            'type' => 'step',
            'name' => 'step',
            'agent_class' => null,
            'status' => 'failed',
            'issue_kind' => 'rate_limited',
            'attempt' => 2,
            'sequence' => 2,
            'step_number' => 3,
            'provider' => 'anthropic',
            'model' => 'claude-a',
            'responding_model' => 'claude-b',
            'duration_ms' => 1250.5,
            'offset_ms' => 250,
            'started_at' => '2026-01-02T11:00:00.250Z',
            'ended_at' => '2026-01-02T11:00:01.500Z',
            'usage' => [
                'state' => 'reported', 'input_tokens' => 120, 'output_tokens' => 30, 'cache_read_tokens' => 4,
                'cache_write_tokens' => 5, 'reasoning_tokens' => 6, 'total_tokens' => 150,
            ],
            'cost' => ['state' => 'estimated', 'amount' => 0.0006],
            'error' => ['class' => 'RateLimitedException', 'message' => 'Slow down', 'source' => 'step', 'http_status' => 429],
            'input' => ['messages' => [['role' => 'user', 'content' => 'Hi']], 'messages_offset' => 0, 'options' => null],
            'output' => ['text' => 'No', 'tool_calls' => [], 'finish_reason' => 'stop'],
            'metadata' => ['note' => 'kept'],
            'redacted' => true,
            'truncated' => true,
            'truncated_paths' => ['input.messages.0.content' => 12000],
        ]);
    });

    it('measures the offset from the start of the run, signed and from the stored times', function () {
        $trace = traceShowRun(['started_at' => '2026-01-02 11:00:00.500']);
        traceShowSpan($trace, 1, ['type' => SpanType::Agent, 'started_at' => '2026-01-02 11:00:00.500']);
        traceShowSpan($trace, 2, ['started_at' => '2026-01-02 11:00:00.125']);
        traceShowSpan($trace, 3, ['started_at' => '2026-01-02 11:00:02.750']);

        expect(array_column(traceShowRows($this)['data']['spans'], 'offset_ms'))->toBe([0, -375, 2250]);
    });

    it('reports a null where nothing was captured, never a zero', function () {
        $trace = traceShowRun();
        traceShowSpan($trace, 1, ['type' => SpanType::Agent, 'duration_ms' => null, 'ended_at' => null]);
        traceShowSpan($trace, 2, ['duration_ms' => null, 'ended_at' => null]);

        $body = traceShowRows($this);

        expect($body['data']['spans'][1])->toMatchArray([
            'status' => 'completed', 'duration_ms' => null, 'ended_at' => null, 'step_number' => null, 'provider' => null,
            'model' => null, 'responding_model' => null, 'input' => null, 'output' => null, 'metadata' => null, 'error' => null,
        ])->and($body['data']['spans'][1]['usage'])->toBe([
            'state' => 'not_reported', 'input_tokens' => null, 'output_tokens' => null, 'cache_read_tokens' => null,
            'cache_write_tokens' => null, 'reasoning_tokens' => null, 'total_tokens' => null,
        ])->and($body['data']['spans'][1]['cost'])->toBe(['state' => 'not_captured', 'amount' => null])
            ->and($body['data']['coverage']['timing'])->toBe(['state' => 'not_captured', 'captured' => 0, 'expected' => 2, 'reason' => 'not_reported']);
    });

    it('tells a span with no usage, a span that could not be priced and a priced one apart', function () {
        $trace = traceShowRun(['input_tokens' => 150, 'output_tokens' => 15, 'cost' => 0.001, 'unpriced_span_count' => 1]);
        traceShowSpan($trace, 1, ['type' => SpanType::Agent]);
        traceShowSpan($trace, 2, ['parent_id' => 'span-1', 'input_tokens' => 100, 'output_tokens' => 10, 'cost' => 0.001]);
        traceShowSpan($trace, 3, ['parent_id' => 'span-1']);
        traceShowSpan($trace, 4, ['parent_id' => 'span-1', 'input_tokens' => 50, 'output_tokens' => 5]);

        $body = traceShowRows($this);
        $spans = $body['data']['spans'];

        expect(array_map(fn (array $span) => $span['cost']['state'] ?? null, $spans))->toBe([null, 'estimated', 'not_captured', 'unpriced'])
            ->and(array_map(fn (array $span) => $span['usage']['state'] ?? null, $spans))->toBe([null, 'reported', 'not_reported', 'reported'])
            ->and($spans[3]['cost'])->toBe(['state' => 'unpriced', 'amount' => null])
            // The run priced some of its steps, and so did the agent: both are partial, which a span never is.
            ->and($body['data']['trace']['cost'])->toBe(['state' => 'partial', 'amount' => 0.001])
            ->and($body['data']['usage']['totals']['cost'])->toBe(['state' => 'partial', 'amount' => 0.001])
            ->and($body['data']['usage']['agents'][0]['cost'])->toBe(['state' => 'partial', 'amount' => 0.001])
            ->and($body['data']['coverage']['usage'])->toBe(['state' => 'partial', 'captured' => 2, 'expected' => 3, 'reason' => 'not_reported'])
            ->and($body['data']['coverage']['cost'])->toBe(['state' => 'partial', 'captured' => 1, 'expected' => 2, 'reason' => 'no_price']);
    });

    it('adds the rows up to the totals of the run', function () {
        $trace = traceShowRun(['input_tokens' => 600, 'output_tokens' => 70, 'cache_read_tokens' => 9, 'cost' => 0.0035]);
        traceShowSpan($trace, 1, ['type' => SpanType::Agent]);
        traceShowSpan($trace, 2, ['parent_id' => 'span-1', 'input_tokens' => 100, 'output_tokens' => 10, 'cost' => 0.0005]);
        traceShowSpan($trace, 3, ['parent_id' => 'span-1', 'type' => SpanType::Tool, 'name' => 'lookup']);
        traceShowSpan($trace, 4, ['parent_id' => 'span-1', 'input_tokens' => 200, 'output_tokens' => 20, 'cache_read_tokens' => 9, 'cost' => 0.001]);
        traceShowSpan($trace, 5, ['parent_id' => 'span-3', 'type' => SpanType::Embedding, 'input_tokens' => 300, 'output_tokens' => 40, 'cost' => 0.002]);

        $body = traceShowRows($this);
        $usage = $body['data']['usage'];
        $sum = fn (array $items, array $path) => array_sum(array_map(fn (array $item) => $item[$path[0]][$path[1]] ?? 0, $items));

        expect($usage['totals'])->toBe(['usage' => $body['data']['trace']['usage'], 'cost' => $body['data']['trace']['cost']])
            ->and(array_column($usage['rows'], 'span_id'))->toBe(['span-2', 'span-4', 'span-5'])
            ->and($sum($usage['rows'], ['usage', 'input_tokens']))->toBe($usage['totals']['usage']['input_tokens'])
            ->and($sum($usage['rows'], ['usage', 'output_tokens']))->toBe($usage['totals']['usage']['output_tokens'])
            ->and(round($sum($usage['rows'], ['cost', 'amount']), 10))->toBe($usage['totals']['cost']['amount'])
            ->and($usage['agents'])->toHaveCount(1)
            ->and($usage['agents'][0]['usage']['input_tokens'])->toBe(600)
            ->and($usage['agents'][0]['cost'])->toBe(['state' => 'estimated', 'amount' => 0.0035]);
    });

    it('returns a span whose parent is not in the response, with no agent', function () {
        $trace = traceShowRun();
        traceShowSpan($trace, 1, ['type' => SpanType::Agent]);
        traceShowSpan($trace, 2, ['parent_id' => 'span-1', 'input_tokens' => 10]);
        traceShowSpan($trace, 3, ['parent_id' => 'span-gone', 'input_tokens' => 20]);
        traceShowSpan($trace, 4, ['parent_id' => null, 'input_tokens' => 30]);

        $body = traceShowRows($this);
        $agentOf = array_column($body['data']['usage']['rows'], 'agent_span_id', 'span_id');

        expect(array_column($body['data']['spans'], 'id'))->toBe(['span-1', 'span-2', 'span-3', 'span-4'])
            ->and($body['data']['spans'][2]['parent_id'])->toBe('span-gone')
            ->and($agentOf)->toBe(['span-2' => 'span-1', 'span-3' => null, 'span-4' => null])
            ->and($body['data']['usage']['agents'][0]['usage']['input_tokens'])->toBe(10);
    });

    it('finds the nearest agent through the spans between, and survives a parent that loops', function () {
        $trace = traceShowRun();
        traceShowSpan($trace, 1, ['type' => SpanType::Agent]);
        traceShowSpan($trace, 2, ['parent_id' => 'span-1', 'type' => SpanType::Tool]);
        traceShowSpan($trace, 3, ['parent_id' => 'span-2', 'type' => SpanType::Agent]);
        traceShowSpan($trace, 4, ['parent_id' => 'span-3', 'type' => SpanType::Tool]);
        traceShowSpan($trace, 5, ['parent_id' => 'span-4', 'type' => SpanType::Embedding, 'input_tokens' => 7]);
        traceShowSpan($trace, 6, ['parent_id' => 'span-7', 'input_tokens' => 1]);
        traceShowSpan($trace, 7, ['parent_id' => 'span-6', 'type' => SpanType::Tool]);

        $agentOf = array_column(traceShowRows($this)['data']['usage']['rows'], 'agent_span_id', 'span_id');

        expect($agentOf)->toBe(['span-5' => 'span-3', 'span-6' => null]);
    });

    it('shows a running run with what is known so far as pending, not as final', function () {
        $trace = traceShowRun(['status' => Status::Running, 'input_tokens' => 300, 'cost' => 0.0012, 'ended_at' => null]);
        traceShowSpan($trace, 1, ['type' => SpanType::Agent, 'status' => Status::Running, 'ended_at' => null, 'duration_ms' => null]);
        traceShowSpan($trace, 2, ['parent_id' => 'span-1', 'input_tokens' => 300, 'cost' => 0.0012]);
        traceShowSpan($trace, 3, ['parent_id' => 'span-1', 'status' => Status::Running, 'ended_at' => null, 'duration_ms' => null]);
        traceShowSpan($trace, 4, ['parent_id' => 'span-1', 'status' => Status::Running, 'ended_at' => null, 'duration_ms' => null, 'input_tokens' => 40]);

        $body = traceShowRows($this);
        $spans = $body['data']['spans'];

        expect($body['data']['trace']['cost'])->toBe(['state' => 'pending', 'amount' => 0.0012])
            ->and($body['data']['trace']['usage']['state'])->toBe('pending')
            // A finished span inside a running run reports its own final state.
            ->and($spans[1]['status'])->toBe('completed')
            ->and($spans[1]['usage']['state'])->toBe('reported')
            ->and($spans[1]['cost'])->toBe(['state' => 'estimated', 'amount' => 0.0012])
            ->and($spans[2]['usage'])->toMatchArray(['state' => 'pending', 'input_tokens' => null])
            ->and($spans[2]['cost'])->toBe(['state' => 'pending', 'amount' => null])
            ->and($spans[3]['usage'])->toMatchArray(['state' => 'pending', 'input_tokens' => 40])
            ->and($spans[3]['cost'])->toBe(['state' => 'pending', 'amount' => null])
            ->and($body['data']['usage']['agents'][0]['cost'])->toBe(['state' => 'pending', 'amount' => 0.0012])
            ->and($body['data']['usage']['agents'][0]['usage']['state'])->toBe('pending')
            // Only the spans that are not running are expected to have a duration.
            ->and($body['data']['coverage']['timing'])->toBe(['state' => 'captured', 'captured' => 1, 'expected' => 1, 'reason' => null])
            ->and($body['data']['coverage']['usage'])->toBe(['state' => 'captured', 'captured' => 1, 'expected' => 1, 'reason' => null])
            // The running step reported tokens and has no cost yet: that is pending, not a missing price.
            ->and($body['data']['coverage']['cost'])->toBe(['state' => 'captured', 'captured' => 1, 'expected' => 1, 'reason' => null]);
    });

    it('reports a stale run and its open spans as abandoned, and leaves its finished spans as they are', function () {
        $old = Carbon::now()->subHours(2);
        $trace = traceShowRun(['status' => Status::Running, 'created_at' => $old, 'started_at' => '2026-01-02 09:55:00', 'input_tokens' => 15, 'cost' => 0.0001, 'unpriced_span_count' => 1]);
        traceShowSpan($trace, 1, ['type' => SpanType::Agent, 'status' => Status::Running, 'created_at' => $old, 'duration_ms' => null, 'ended_at' => null]);
        traceShowSpan($trace, 2, ['parent_id' => 'span-1', 'created_at' => $old, 'input_tokens' => 10, 'cost' => 0.0001]);
        traceShowSpan($trace, 3, ['parent_id' => 'span-1', 'status' => Status::Running, 'created_at' => $old, 'duration_ms' => null, 'ended_at' => null, 'input_tokens' => 5]);
        traceShowSpan($trace, 4, ['parent_id' => 'span-1', 'type' => SpanType::Tool, 'status' => Status::Running, 'created_at' => $old, 'duration_ms' => null, 'ended_at' => null]);

        $body = traceShowRows($this);
        $spans = $body['data']['spans'];

        expect($body['data']['trace'])->toMatchArray(['status' => 'incomplete', 'issue_kind' => 'abandoned'])
            ->and(array_column($spans, 'status'))->toBe(['incomplete', 'completed', 'incomplete', 'incomplete'])
            ->and(array_column($spans, 'issue_kind'))->toBe(['abandoned', null, 'abandoned', 'abandoned'])
            ->and($spans[2]['usage']['state'])->toBe('reported')
            ->and($spans[2]['cost'])->toBe(['state' => 'unpriced', 'amount' => null])
            ->and($body['data']['usage']['agents'][0]['cost'])->toBe(['state' => 'partial', 'amount' => 0.0001])
            ->and($body['data']['usage']['agents'][0]['usage']['state'])->toBe('reported')
            ->and($body['data']['trace']['cost'])->toBe(['state' => 'partial', 'amount' => 0.0001])
            ->and($body['data']['trace']['usage']['state'])->toBe('reported')
            ->and($body['data']['coverage']['timing'])->toBe(['state' => 'partial', 'captured' => 1, 'expected' => 4, 'reason' => 'unfinished']);
    });

    it('does not call a span that finished without a duration unfinished', function () {
        $trace = traceShowRun();
        traceShowSpan($trace, 1, ['type' => SpanType::Agent, 'status' => Status::Incomplete]);
        traceShowSpan($trace, 2, ['parent_id' => 'span-1', 'duration_ms' => null]);
        traceShowSpan($trace, 3, ['parent_id' => 'span-1', 'status' => Status::Incomplete, 'duration_ms' => null]);

        expect(traceShowRows($this)['data']['coverage']['timing'])->toBe(['state' => 'partial', 'captured' => 1, 'expected' => 3, 'reason' => 'not_reported']);
    });

    it('reports a step that did not complete as not expected to name the model that answered', function () {
        $trace = traceShowRun();
        traceShowSpan($trace, 1, ['type' => SpanType::Agent]);
        traceShowSpan($trace, 2, ['parent_id' => 'span-1', 'responding_model' => 'claude-b']);
        traceShowSpan($trace, 3, ['parent_id' => 'span-1', 'status' => Status::Failed, 'responding_model' => null]);
        traceShowSpan($trace, 4, ['parent_id' => 'span-1', 'responding_model' => null]);

        $coverage = traceShowRows($this)['data']['coverage'];

        expect($coverage['responding_model'])->toBe(['state' => 'partial', 'captured' => 1, 'expected' => 2, 'reason' => 'not_reported']);
    });

    it('counts the system prompts and payloads that were stored', function () {
        $trace = traceShowRun();
        traceShowSpan($trace, 1, ['type' => SpanType::Agent, 'input' => ['prompt' => 'Hi', 'system' => 'Be brief']]);
        traceShowSpan($trace, 2, ['type' => SpanType::Agent, 'parent_id' => 'span-1', 'input' => ['prompt' => 'Hi', 'system' => '']]);
        traceShowSpan($trace, 3, ['type' => SpanType::Agent, 'parent_id' => 'span-1', 'input' => ['prompt' => 'Hi', 'system' => null]]);
        traceShowSpan($trace, 4, ['parent_id' => 'span-1', 'output' => ['text' => 'x']]);
        traceShowSpan($trace, 5, ['parent_id' => 'span-1']);

        $coverage = traceShowRows($this)['data']['coverage'];

        expect($coverage['system_prompt'])->toBe(['state' => 'partial', 'captured' => 1, 'expected' => 3, 'reason' => 'not_stored'])
            ->and($coverage['payloads'])->toBe(['state' => 'partial', 'captured' => 4, 'expected' => 5, 'reason' => 'not_stored']);
    });

    it('reports every coverage state', function () {
        $trace = traceShowRun();
        traceShowSpan($trace, 1, ['type' => SpanType::Agent, 'input' => ['system' => 'x']]);

        $coverage = traceShowRows($this)['data']['coverage'];

        expect($coverage['system_prompt']['state'])->toBe('captured')
            ->and($coverage['usage']['state'])->toBe('not_applicable')
            ->and($coverage['cost'])->toBe(['state' => 'not_applicable', 'captured' => 0, 'expected' => 0, 'reason' => null])
            ->and($coverage['payloads']['state'])->toBe('captured')
            ->and($coverage['timing']['state'])->toBe('captured');

        traceShowSpan($trace, 2, ['parent_id' => 'span-1', 'input_tokens' => 3, 'duration_ms' => null]);

        $coverage = traceShowRows($this)['data']['coverage'];

        expect($coverage['usage']['state'])->toBe('captured')
            ->and($coverage['cost'])->toBe(['state' => 'not_captured', 'captured' => 0, 'expected' => 1, 'reason' => 'no_price'])
            ->and($coverage['timing']['state'])->toBe('partial')
            ->and($coverage['payloads']['state'])->toBe('partial');
    });

    it('sends the redacted and truncated flags and the original lengths, without the paths in the metadata', function () {
        $trace = traceShowRun();
        traceShowSpan($trace, 1, ['type' => SpanType::Agent]);
        traceShowSpan($trace, 2, [
            'parent_id' => 'span-1', 'redacted' => true, 'truncated' => true,
            'metadata' => ['truncated' => ['input.messages.0.content' => 12000, 'output.text' => 5000], 'resolved_tool_call_ids' => ['toolu_1']],
        ]);
        traceShowSpan($trace, 3, ['parent_id' => 'span-1', 'truncated' => true, 'metadata' => ['truncated' => ['output.text' => 77]]]);

        $spans = traceShowRows($this)['data']['spans'];

        expect($spans[0])->toMatchArray(['redacted' => false, 'truncated' => false])
            ->and($spans[1])->toMatchArray(['redacted' => true, 'truncated' => true])
            ->and($spans[1]['truncated_paths'])->toBe(['input.messages.0.content' => 12000, 'output.text' => 5000])
            ->and($spans[1]['metadata'])->toBe(['resolved_tool_call_ids' => ['toolu_1']])
            ->and($spans[2]['truncated_paths'])->toBe(['output.text' => 77])
            ->and($spans[2]['metadata'])->toBeNull();
    });

    it('sends no truncated paths as an object, not as a list', function () {
        $trace = traceShowRun();
        traceShowSpan($trace, 1, ['type' => SpanType::Agent, 'metadata' => ['note' => 'kept']]);
        traceShowSpan($trace, 2, ['parent_id' => 'span-1', 'truncated' => true]);

        $response = $this->getJson('/trail/api/traces/trace-1')->assertOk();
        $spans = json_decode($response->getContent(), flags: JSON_THROW_ON_ERROR)->data->spans;

        expect($spans)->toHaveCount(2)
            ->and($spans[0]->metadata)->toEqual((object) ['note' => 'kept'])
            ->and($spans[0]->truncated_paths)->toBeInstanceOf(stdClass::class)
            ->and($spans[1]->truncated_paths)->toBeInstanceOf(stdClass::class)
            ->and($response->getContent())->toContain('"truncated_paths":{}');
    });

    it('keeps the full error of the run beside it, and nothing of it on the run', function () {
        $message = str_repeat('Provider said no. ', 500);
        traceShowRun([
            'status' => Status::Failed, 'issue_kind' => IssueKind::ProviderOverloaded, 'error_class' => 'OverloadedException',
            'error_message' => $message, 'error_source' => ErrorSource::Run, 'error_http_status' => 529,
        ]);

        $data = traceShowRows($this)['data'];

        expect($data['detail']['error'])->toBe(['class' => 'OverloadedException', 'message' => $message, 'source' => 'run', 'http_status' => 529])
            ->and(strlen($message))->toBeGreaterThan(8000)
            ->and($data['trace'])->not->toHaveKey('error')
            ->and($data['trace']['issue_kind'])->toBe('provider_overloaded');
    });

    it('reports an error with only a message, or only a class', function () {
        traceShowRun(['id' => 'trace-1', 'status' => Status::Failed, 'error_message' => 'Boom']);
        traceShowRun(['id' => 'trace-2', 'status' => Status::Failed, 'error_class' => 'RuntimeException']);

        expect(traceShowRows($this, 'trace-1')['data']['detail']['error'])->toBe(['class' => null, 'message' => 'Boom', 'source' => null, 'http_status' => null])
            ->and(traceShowRows($this, 'trace-2')['data']['detail']['error'])->toBe(['class' => 'RuntimeException', 'message' => null, 'source' => null, 'http_status' => null]);
    });

    it('reads the approvals of the metadata defensively', function () {
        traceShowRun([
            'status' => Status::AwaitingApproval,
            'metadata' => [
                'pending_approvals' => [
                    ['tool_call_id' => 'toolu_1', 'tool' => 'delete', 'arguments' => ['table' => 'users'], 'reason' => 'Deletes data'],
                    ['tool_call_id' => 'toolu_2', 'tool' => 'send'],
                    ['tool_call_id' => 'toolu_3', 'tool' => 'ping', 'arguments' => null, 'reason' => 42],
                    ['tool_call_id' => 'toolu_4'],
                    ['tool' => 'orphan'],
                    ['tool_call_id' => 5, 'tool' => 'numbered'],
                    'not an entry',
                ],
                'resolved_tool_call_ids' => ['toolu_0', 7, null, 'toolu_9'],
            ],
        ]);

        expect(traceShowRows($this)['data']['detail'])->toBe([
            'error' => null,
            'pending_approvals' => [
                ['tool_call_id' => 'toolu_1', 'tool' => 'delete', 'arguments' => ['table' => 'users'], 'reason' => 'Deletes data'],
                ['tool_call_id' => 'toolu_2', 'tool' => 'send', 'arguments' => null, 'reason' => null],
                ['tool_call_id' => 'toolu_3', 'tool' => 'ping', 'arguments' => null, 'reason' => null],
            ],
            'resolved_tool_call_ids' => ['toolu_0', 'toolu_9'],
        ]);
    });

    it('reads metadata that is not what capture stores as nothing', function (mixed $metadata) {
        traceShowRun(['metadata' => $metadata]);

        expect(traceShowRows($this)['data']['detail'])->toBe(['error' => null, 'pending_approvals' => [], 'resolved_tool_call_ids' => []]);
    })->with([
        'none' => [null],
        'empty' => [[]],
        'other keys' => [['other' => 1]],
        'scalars' => [['pending_approvals' => 'x', 'resolved_tool_call_ids' => 3]],
    ]);

    it('reads metadata and payloads that are not arrays without failing', function () {
        $trace = traceShowRun();
        traceShowSpan($trace, 1, ['type' => SpanType::Agent, 'input' => ['prompt' => 'Hi']]);
        DB::table('trail_spans')->where('id', 'span-1')->update(['metadata' => '"text"', 'input' => '"plain"']);
        traceShowSpan($trace, 2, ['parent_id' => 'span-1']);
        DB::table('trail_spans')->where('id', 'span-2')->update(['metadata' => '7']);
        DB::table('trail_traces')->where('id', 'trace-1')->update(['metadata' => '"text"']);

        $body = traceShowRows($this);

        expect(array_column($body['data']['spans'], 'metadata'))->toBe([null, null])
            ->and($body['data']['spans'][0]['input'])->toBe('plain')
            ->and($body['data']['coverage']['system_prompt'])->toBe(['state' => 'not_captured', 'captured' => 0, 'expected' => 1, 'reason' => 'not_stored'])
            ->and($body['data']['detail']['pending_approvals'])->toBe([]);
    });

    it('sends a run with no span at all', function () {
        traceShowRun();

        $body = traceShowRows($this);

        expect($body['data']['spans'])->toBe([])
            ->and($body['span_limit'])->toBe(['limit' => 2000, 'total' => 0, 'truncated' => false])
            ->and($body['data']['usage']['rows'])->toBe([])
            ->and($body['data']['usage']['agents'])->toBe([])
            ->and(array_column($body['data']['coverage'], 'state'))->each->toBe('not_applicable');
    });
});

describe('the span limit', function () {
    /**
     * Spans written in bulk; the query builder keeps 2001 rows cheap.
     */
    function traceShowBulkSpans(Trace $trace, int $count): void
    {
        $now = '2026-01-02 11:00:00.000';

        foreach (array_chunk(range(1, $count), 250) as $chunk) {
            Span::query()->insert(array_map(fn (int $sequence) => [
                'id' => sprintf('span-%05d', $sequence), 'trace_id' => $trace->id, 'type' => 'step', 'name' => 'step', 'status' => 'completed',
                'sequence' => $sequence, 'started_at' => $now, 'created_at' => $now, 'updated_at' => $now,
            ], $chunk));
        }
    }

    beforeEach(function () {
        Carbon::setTestNow('2026-01-02 12:00:00');
        $this->counted = [];
        DB::listen(function ($query) {
            if (stripos($query->sql, 'count(') !== false) {
                $this->counted[] = $query->sql;
            }
        });
    });

    it('stops at the limit, says so, and counts the rest once', function () {
        $trace = Rows::trace(['id' => 'trace-1', 'status' => Status::Completed, 'span_count' => 2001]);
        traceShowBulkSpans($trace, 2001);

        $body = $this->getJson('/trail/api/traces/trace-1')->assertOk()->json();
        $ids = array_column($body['data']['spans'], 'id');

        expect(TraceDetail::SPAN_LIMIT)->toBe(2000)
            ->and($body['span_limit'])->toBe(['limit' => 2000, 'total' => 2001, 'truncated' => true])
            ->and($ids)->toHaveCount(2000)
            ->and($ids[0])->toBe('span-00001')
            ->and($ids[1999])->toBe('span-02000')
            ->and($body['data']['usage']['rows'])->toHaveCount(2000)
            ->and($body['data']['coverage']['payloads']['expected'])->toBe(2000)
            // The totals are the run's own, whatever part of it the page shows.
            ->and($body['data']['trace']['span_count'])->toBe(2001)
            ->and($this->counted)->toHaveCount(1);
    });

    it('sends a run of exactly the limit whole, without counting', function () {
        $trace = Rows::trace(['id' => 'trace-1', 'status' => Status::Completed, 'span_count' => 2000]);
        traceShowBulkSpans($trace, 2000);

        $body = $this->getJson('/trail/api/traces/trace-1')->assertOk()->json();

        expect($body['span_limit'])->toBe(['limit' => 2000, 'total' => 2000, 'truncated' => false])
            ->and($body['data']['spans'])->toHaveCount(2000)
            ->and(end($body['data']['spans'])['id'])->toBe('span-02000')
            ->and($this->counted)->toBe([]);
    });

    it('orders spans by sequence and then id', function () {
        $trace = Rows::trace(['id' => 'trace-1', 'status' => Status::Completed]);
        Rows::span($trace, ['id' => 'b', 'sequence' => 1]);
        Rows::span($trace, ['id' => 'a', 'sequence' => 1]);
        Rows::span($trace, ['id' => 'c', 'sequence' => 0]);

        expect(array_column($this->getJson('/trail/api/traces/trace-1')->json('data.spans'), 'id'))->toBe(['c', 'a', 'b']);
    });
});

describe('the cost of a request', function () {
    beforeEach(function () {
        Carbon::setTestNow('2026-01-02 12:00:00');
        $this->queries = 0;
        DB::listen(function () {
            $this->queries++;
        });
    });

    /**
     * Queries one request issues for a run with the given number of spans.
     */
    function traceShowQueries(mixed $test, string $id, int $spans): int
    {
        $trace = Rows::trace(['id' => $id, 'status' => Status::Completed, 'span_count' => $spans]);
        Rows::bookmark($trace);

        foreach (range(1, $spans) as $sequence) {
            Rows::span($trace, ['id' => "{$id}-{$sequence}", 'sequence' => $sequence, 'type' => $sequence === 1 ? SpanType::Agent : SpanType::Step]);
        }

        $test->queries = 0;
        $response = $test->getJson("/trail/api/traces/{$id}")->assertOk();
        $queries = $test->queries;

        expect($response->json('data.spans'))->toHaveCount($spans);

        return $queries;
    }

    it('does not grow with the number of spans', function () {
        $few = traceShowQueries($this, 'few', 3);
        $many = traceShowQueries($this, 'many', 60);

        // The run, its spans and its bookmarks, with the user lookup when it has a user.
        expect($many)->toBe($few)->and($few)->toBeLessThanOrEqual(4);
    });

    it('does not touch the database for an id the column could not hold', function (string $sent) {
        $this->queries = 0;

        $this->getJson("/trail/api/traces/{$sent}")->assertNotFound()->assertJsonStructure(['message']);

        expect($this->queries)->toBe(0);
    })->with([
        'too long' => [str_repeat('x', 65)],
        'a null byte' => ['a%00b'],
    ]);
});

describe('what is refused', function () {
    it('refuses an id that is not UTF-8 before the database is reached', function () {
        $queries = 0;
        DB::listen(function () use (&$queries) {
            $queries++;
        });

        // The framework refuses a malformed path itself, with a 400 and no run is looked up.
        $this->getJson('/trail/api/traces/%FF')->assertStatus(400)->assertJsonStructure(['message']);
        expect($queries)->toBe(0);

        // And the guard that every id passes would refuse it too, were one to get past.
        expect(TraceId::isPossible("a\xFFb"))->toBeFalse()
            ->and(TraceId::isPossible("a\0b"))->toBeFalse()
            ->and(TraceId::isPossible(str_repeat('x', 65)))->toBeFalse()
            ->and(TraceId::isPossible('ünï-'.str_repeat('x', 60)))->toBeTrue();
    });

    it('answers a JSON 404 for an unknown run, whatever is asked for', function () {
        Rows::trace(['id' => 'trace-1', 'status' => Status::Completed]);

        $this->getJson('/trail/api/traces/nothing')->assertNotFound()->assertJsonStructure(['message']);
        $this->get('/trail/api/traces/nothing', ['Accept' => 'text/html'])->assertNotFound()->assertJsonStructure(['message']);
        $this->getJson('/trail/api/traces/trace-1')->assertOk();
    });

    it('answers a run of exactly the longest id', function () {
        $id = str_repeat('x', 64);
        Rows::trace(['id' => $id, 'status' => Status::Completed]);

        $this->getJson("/trail/api/traces/{$id}")->assertOk()->assertJsonPath('data.trace.id', $id);
    });

    it('is not found when the dashboard is switched off', function () {
        Rows::trace(['id' => 'trace-1', 'status' => Status::Completed]);
        config(['trail.dashboard.enabled' => false]);

        $this->getJson('/trail/api/traces/trace-1')->assertNotFound();
    });

    it('answers a denied request with a JSON 403, even when HTML is asked for', function () {
        Rows::trace(['id' => 'trace-1', 'status' => Status::Completed]);
        $this->app['env'] = 'production';
        Gate::define('viewTrail', fn () => false);

        $this->get('/trail/api/traces/trace-1', ['Accept' => 'text/html'])->assertForbidden()->assertJsonStructure(['message']);

        Trail::auth(fn () => true);

        $this->get('/trail/api/traces/trace-1', ['Accept' => 'text/html'])->assertOk()->assertJsonPath('data.trace.id', 'trace-1');

        // Rolling back this test's migrations asks for confirmation in production.
        $this->app['env'] = 'testing';
    });
});
