<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Agents\ManyStepsAgent;
use Astro\Trail\Tests\Fixtures\Agents\RememberingAgent;
use Astro\Trail\Tests\Fixtures\Agents\ResearcherAgent;
use Astro\Trail\Tests\Fixtures\Capture\Approvals;
use Astro\Trail\Tests\Fixtures\Capture\Failures;
use Astro\Trail\Tests\Fixtures\Capture\Hardening\Replay;
use Astro\Trail\Tests\Fixtures\Capture\Streams;
use Astro\Trail\Tests\Fixtures\Conversations\ConversationParticipant;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Tools\ApprovalTool;
use Astro\Trail\Tests\Fixtures\Tools\CallbackTool;
use Astro\Trail\Tests\Fixtures\Tools\LookupTool;
use Illuminate\Http\Client\RequestException;
use Laravel\Ai\Approvals\Decision;
use Laravel\Ai\Approvals\Decisions;
use Laravel\Ai\Events\StartingStep;
use Laravel\Ai\Exceptions\RateLimitedException;
use Laravel\Ai\Messages\AssistantMessage;
use Laravel\Ai\Messages\UserMessage;

/*
|--------------------------------------------------------------------------
| The messages of a turn, from spans the real SDK produced
|--------------------------------------------------------------------------
|
| The turn boundary rests on what the SDK really sends on a remembered second turn and on a
| resumed run, so these runs are recorded through the real capture layer. A run that is not part
| of a remembered conversation is given a conversation id afterwards: nothing else about it
| changes.
|
*/

beforeEach(function () {
    $this->app['env'] = 'local';
    $this->user = new ConversationParticipant;

    config(['trail.pricing.anthropic' => [FakeAnthropic::MODEL => ['input' => 3.0, 'output' => 15.0]]]);

    /** The transcript of a conversation, after the runs were flushed. */
    $this->transcript = function (string $conversation, string $query = ''): array {
        Trail::flush();

        return $this->getJson('/trail/api/conversations/transcript?id='.rawurlencode($conversation).($query === '' ? '' : '&'.$query))->assertOk()->json();
    };

    /** The one turn of a plain run, given a conversation of its own. */
    $this->turnOf = function (string $invocation): array {
        Trail::flush();
        Trace::query()->whereKey($invocation)->update(['conversation_id' => 'conversation-'.$invocation]);

        return ($this->transcript)('conversation-'.$invocation)['data']['turns'][0];
    };
});

/**
 * What each message is at a glance: part, role and content.
 *
 * @param  array<string, mixed>  $turn
 * @return list<array{string, ?string, mixed}>
 */
function captureOutline(array $turn): array
{
    return array_map(fn (array $message): array => [$message['part'], $message['role'], $message['content']], $turn['messages']);
}

/**
 * @param  array<string, mixed>  $turn
 * @return list<string>
 */
function captureLinks(array $message): array
{
    return array_map(fn (array $call): string => $call['link'], $message['tool_calls'] ?? []);
}

describe('a plain run', function () {
    it('is the prompt and the response, each stored by the step', function () {
        FakeAnthropic::script([FakeAnthropic::text('Hello')]);

        $run = (new AssistantAgent)->prompt('Hi', model: FakeAnthropic::MODEL);
        $turn = ($this->turnOf)($run->invocationId);

        expect(captureOutline($turn))->toBe([['prompt', 'user', 'Hi'], ['response', 'assistant', 'Hello']])
            ->and([$turn['messages_state'], $turn['messages_reason'], $turn['history_count']])->toBe(['stored', null, 0])
            ->and($turn['root_span_id'])->toBe($run->invocationId)
            ->and($turn['shown_attempt'])->toBe(1)
            ->and($turn['messages'][0]['source']['path'])->toBe('input.messages.0')
            ->and($turn['messages'][1]['source']['path'])->toBe('output')
            ->and($turn['messages'][0]['source']['span_id'])->toBe($turn['messages'][1]['source']['span_id'])
            ->and($turn['attempts'])->toBe([['attempt' => 1, 'provider' => 'anthropic', 'model' => FakeAnthropic::MODEL, 'span_id' => $turn['messages'][0]['source']['span_id'], 'error' => null]]);
    });

    it('is the same when it is streamed', function () {
        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'x']]], text: 'Let me look'),
            FakeAnthropic::text('Done now'),
        ]);

        $stream = (new AssistantAgent([new LookupTool]))->stream('Hi', model: FakeAnthropic::MODEL);
        Streams::drain($stream);
        $turn = ($this->turnOf)($stream->invocationId);

        expect($turn['trace']['streamed'])->toBeTrue()
            ->and(captureOutline($turn))->toBe([['prompt', 'user', 'Hi'], ['activity', 'assistant', 'Let me look'], ['activity', 'tool_result', null], ['response', 'assistant', 'Done now']])
            ->and($turn['messages_state'])->toBe('stored')
            ->and(captureLinks($turn['messages'][1]))->toBe(['linked']);
    });

    it('has no messages and no reason when payload capture is off', function () {
        config(['trail.capture.enabled' => false]);
        FakeAnthropic::script([FakeAnthropic::text('Hello')]);

        $turn = ($this->turnOf)((new AssistantAgent)->prompt('Hi', model: FakeAnthropic::MODEL)->invocationId);

        expect($turn['messages'])->toBe([])
            ->and([$turn['messages_state'], $turn['messages_reason'], $turn['history_count']])->toBe(['not_stored', null, null])
            ->and($turn['root_span_id'])->not->toBeNull()
            ->and($turn['attempts'])->toHaveCount(1);
    });

    it('marks what was cut with the length it had, on the message it belongs to', function () {
        config(['trail.capture.max_length' => 20]);
        FakeAnthropic::script([FakeAnthropic::text(str_repeat('b', 70))]);

        $turn = ($this->turnOf)((new AssistantAgent)->prompt(str_repeat('a', 100), model: FakeAnthropic::MODEL)->invocationId);

        expect($turn['messages'][0]['truncated_paths'])->toBe(['content' => 100])
            ->and($turn['messages'][0]['source']['truncated'])->toBeTrue()
            ->and($turn['messages'][1]['truncated_paths'])->toBe(['content' => 70])
            ->and($turn['messages'][1]['content'])->toBe(str_repeat('b', 20));
    });
});

describe('a run with tools', function () {
    it('returns the assistant message and the tool result once, with the tool span of each call', function () {
        FakeAnthropic::script([
            FakeAnthropic::toolUse([
                ['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'a']],
                ['id' => 'toolu_2', 'name' => 'lookup', 'input' => ['query' => 'b']],
            ], text: 'Let me check'),
            FakeAnthropic::toolUse([['id' => 'toolu_3', 'name' => 'lookup', 'input' => ['query' => 'c']]]),
            FakeAnthropic::text('Done'),
        ]);

        $run = (new ManyStepsAgent([new LookupTool]))->prompt('Hi', model: FakeAnthropic::MODEL);
        $turn = ($this->turnOf)($run->invocationId);
        $spans = $this->getJson('/trail/api/traces/'.$run->invocationId)->json('data.spans');
        $tools = array_values(array_filter($spans, fn (array $span): bool => $span['type'] === 'tool'));

        expect(captureOutline($turn))->toBe([
            ['prompt', 'user', 'Hi'],
            ['activity', 'assistant', 'Let me check'], ['activity', 'tool_result', null],
            ['activity', 'assistant', ''], ['activity', 'tool_result', null],
            ['response', 'assistant', 'Done'],
        ])->and($turn['messages_state'])->toBe('stored')
            ->and(array_column(array_column($turn['messages'][1]['tool_calls'], 'span'), 'id'))->toBe([$tools[0]['id'], $tools[1]['id']])
            ->and(array_column(array_column($turn['messages'][3]['tool_calls'], 'span'), 'id'))->toBe([$tools[2]['id']])
            ->and(array_column($turn['messages'][2]['tool_results'], 'span_id'))->toBe([$tools[0]['id'], $tools[1]['id']])
            ->and(array_column($turn['messages'][4]['tool_results'], 'span_id'))->toBe([$tools[2]['id']])
            ->and($turn['messages'][1]['tool_calls'][0])->toMatchArray(['id' => 'toolu_1', 'name' => 'lookup', 'arguments' => ['query' => 'a'], 'link' => 'linked', 'agent' => null])
            ->and($turn['messages'][1]['tool_calls'][0]['span'])->toMatchArray(['status' => 'completed', 'issue_kind' => null])
            ->and($turn['messages'][1]['tool_calls'][0]['span']['duration_ms'])->toBeFloat();
    });

    it('does not repeat a message the next step\'s input already holds', function () {
        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'a']]], text: 'First'),
            FakeAnthropic::toolUse([['id' => 'toolu_2', 'name' => 'lookup', 'input' => ['query' => 'b']]], text: 'Second'),
            FakeAnthropic::text('Third'),
        ]);

        $turn = ($this->turnOf)((new ManyStepsAgent([new LookupTool]))->prompt('Hi', model: FakeAnthropic::MODEL)->invocationId);

        expect(array_column(captureOutline($turn), 2))->toBe(['Hi', 'First', null, 'Second', null, 'Third']);
    });

    it('shows a tool that failed as the span it is, in a turn that failed with it', function () {
        FakeAnthropic::script([FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'boom', 'input' => ['query' => 'a']]], text: 'Trying')]);

        $boom = new CallbackTool('boom', fn () => throw new RuntimeException('Disk full'));
        Failures::thrown(fn () => (new AssistantAgent([$boom]))->prompt('Hi', model: FakeAnthropic::MODEL));
        $turn = ($this->turnOf)($this->sdk->invocationIds()[0]);

        expect($turn['trace']['status'])->toBe('failed')
            ->and($turn['messages'][1]['tool_calls'][0])->toMatchArray(['link' => 'linked'])
            ->and($turn['messages'][1]['tool_calls'][0]['span'])->toMatchArray(['status' => 'failed', 'issue_kind' => 'tool_error'])
            ->and(array_column($turn['messages'], 'part'))->toBe(['prompt', 'activity']);
    });
});

describe('a remembered conversation', function () {
    it('drops the history of the earlier turns and says how much there was', function () {
        FakeAnthropic::script([
            FakeAnthropic::text('One'),
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'x']]], text: 'Let me'),
            FakeAnthropic::text('Two'),
            FakeAnthropic::text('Three'),
        ]);

        $first = (new RememberingAgent)->forUser($this->user)->prompt('Hi', model: FakeAnthropic::MODEL);
        (new RememberingAgent([new LookupTool]))->continue($first->conversationId, as: $this->user)->prompt('Again', model: FakeAnthropic::MODEL);
        (new RememberingAgent)->continue($first->conversationId, as: $this->user)->prompt('Once more', model: FakeAnthropic::MODEL);

        $body = ($this->transcript)($first->conversationId);
        [$one, $two, $three] = $body['data']['turns'];

        expect(captureOutline($one))->toBe([['prompt', 'user', 'Hi'], ['response', 'assistant', 'One']])
            ->and($one['history_count'])->toBe(0)
            ->and(captureOutline($two))->toBe([['prompt', 'user', 'Again'], ['activity', 'assistant', 'Let me'], ['activity', 'tool_result', null], ['response', 'assistant', 'Two']])
            ->and($two['history_count'])->toBe(2)
            ->and($two['messages'][0]['source']['path'])->toBe('input.messages.2')
            ->and(captureOutline($three))->toBe([['prompt', 'user', 'Once more'], ['response', 'assistant', 'Three']])
            ->and($three['history_count'])->toBe(6)
            ->and(array_unique(array_column($body['data']['turns'], 'messages_state')))->toBe(['stored'])
            ->and(array_unique(array_column($body['data']['turns'], 'messages_reason')))->toBe([null]);
    });

    it('drops history given to the agent by hand in the same way', function () {
        FakeAnthropic::script([FakeAnthropic::text('Now answered')]);

        $run = (new AssistantAgent)
            ->withMessages([new UserMessage('Earlier question'), new AssistantMessage('Earlier answer')])
            ->prompt('Now', model: FakeAnthropic::MODEL);
        $turn = ($this->turnOf)($run->invocationId);

        expect(captureOutline($turn))->toBe([['prompt', 'user', 'Now'], ['response', 'assistant', 'Now answered']])
            ->and($turn['history_count'])->toBe(2)
            ->and($turn['messages_state'])->toBe('stored');
    });
});

describe('a provider failover', function () {
    it('shows the prompt once, both attempts, and the failed one with its error', function () {
        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'a']]]),
            FakeAnthropic::error(429, 'Slow down'),
            FakeAnthropic::text('ok'),
        ]);

        $run = (new AssistantAgent([new LookupTool]))->prompt('Hi', provider: ['anthropic' => 'model-a', 'backup' => 'model-b']);
        $turn = ($this->turnOf)($run->invocationId);

        expect($turn['trace'])->toMatchArray(['status' => 'completed', 'recovered' => true])
            ->and($turn['shown_attempt'])->toBe(2)
            ->and(captureOutline($turn))->toBe([['prompt', 'user', 'Hi'], ['response', 'assistant', 'ok']])
            ->and(array_column($turn['attempts'], 'attempt'))->toBe([1, 2])
            ->and(array_column($turn['attempts'], 'model'))->toBe(['model-a', 'model-b'])
            ->and($turn['attempts'][0]['error'])->toMatchArray(['class' => RateLimitedException::class, 'source' => 'step', 'http_status' => 429])
            ->and($turn['attempts'][1]['error'])->toBeNull()
            ->and($turn['attempts'][0]['span_id'])->not->toBe($turn['attempts'][1]['span_id'])
            ->and($turn['messages'][0]['source']['span_id'])->toBe($turn['attempts'][1]['span_id'])
            ->and($turn['messages_state'])->toBe('stored');
    });

    it('does not link a tool of the first attempt to a call of the second', function () {
        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'a']]]),
            FakeAnthropic::error(429, 'Slow down'),
            FakeAnthropic::toolUse([['id' => 'toolu_2', 'name' => 'lookup', 'input' => ['query' => 'a']]]),
            FakeAnthropic::text('ok'),
        ]);

        $run = (new AssistantAgent([new LookupTool]))->prompt('Hi', provider: ['anthropic' => 'model-a', 'backup' => 'model-b']);
        $turn = ($this->turnOf)($run->invocationId);
        $spans = $this->getJson('/trail/api/traces/'.$run->invocationId)->json('data.spans');
        $tools = array_values(array_filter($spans, fn (array $span): bool => $span['type'] === 'tool'));

        expect($tools)->toHaveCount(2)
            ->and($tools[0]['attempt'])->toBe(1)
            ->and($tools[1]['attempt'])->toBe(2)
            ->and($turn['messages'][1]['tool_calls'][0]['span']['id'])->toBe($tools[1]['id']);
    });
});

describe('a run that failed', function () {
    it('has the prompt and no response', function () {
        FakeAnthropic::script([FakeAnthropic::error(500, 'Server error')]);

        try {
            (new AssistantAgent)->prompt('Hi', model: FakeAnthropic::MODEL);
        } catch (RequestException) {
            // The run failed; its trace is what is read.
        }

        $turn = ($this->turnOf)($this->sdk->invocationIds()[0]);

        expect($turn['trace']['status'])->toBe('failed')
            ->and(captureOutline($turn))->toBe([['prompt', 'user', 'Hi']])
            ->and($turn['messages_state'])->toBe('stored')
            ->and($turn['attempts'][0]['error'])->toMatchArray(['http_status' => 500]);
    });

    it('keeps what the model said before it failed as activity, never as a response', function () {
        FakeAnthropic::script([FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'a']]], text: 'Checking'), FakeAnthropic::error(500, 'Server error')]);

        try {
            (new AssistantAgent([new LookupTool]))->prompt('Hi', model: FakeAnthropic::MODEL);
        } catch (RequestException) {
            // The run failed after its first step.
        }

        $turn = ($this->turnOf)($this->sdk->invocationIds()[0]);

        expect(array_column($turn['messages'], 'part'))->toBe(['prompt', 'activity', 'activity'])
            ->and(captureOutline($turn)[1])->toBe(['activity', 'assistant', 'Checking']);
    });
});

describe('a step that never started', function () {
    /** The SDK says a step is starting; Trail does not hear it. */
    function captureSwallowStart(int $step): void
    {
        Replay::first(StartingStep::class, fn (StartingStep $event) => $event->stepNumber === $step ? false : null);
    }

    it('says so when it is the last, and still returns its output', function () {
        FakeAnthropic::script([FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'a']]], text: 'Checking'), FakeAnthropic::text('Done')]);
        captureSwallowStart(1);

        $turn = ($this->turnOf)((new AssistantAgent([new LookupTool]))->prompt('Hi', model: FakeAnthropic::MODEL)->invocationId);

        expect(captureOutline($turn))->toBe([['prompt', 'user', 'Hi'], ['activity', 'assistant', 'Checking'], ['response', 'assistant', 'Done']])
            ->and([$turn['messages_state'], $turn['messages_reason']])->toBe(['partial', 'step_input_missing']);
    });

    it('is covered by the step after it when the first never started, and the turn still begins at its prompt', function () {
        FakeAnthropic::script([FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'a']]], text: 'Checking'), FakeAnthropic::text('Done')]);
        captureSwallowStart(0);

        $run = (new AssistantAgent([new LookupTool]))->prompt('Hi', model: FakeAnthropic::MODEL);
        $turn = ($this->turnOf)($run->invocationId);
        $spans = $this->getJson('/trail/api/traces/'.$run->invocationId)->json('data.spans');
        $steps = array_values(array_filter($spans, fn (array $span): bool => $span['type'] === 'step'));

        // What capture really stored: no input for the first step, and the second holding the whole history.
        expect($steps[0]['input']['messages'])->toBeNull()
            ->and($steps[1]['input']['messages_offset'])->toBe(0)
            ->and(array_column($steps[1]['input']['messages'], 'role'))->toBe(['user', 'assistant', 'tool_result']);

        expect(captureOutline($turn))->toBe([['prompt', 'user', 'Hi'], ['activity', 'assistant', 'Checking'], ['activity', 'tool_result', null], ['response', 'assistant', 'Done']])
            ->and([$turn['messages_state'], $turn['messages_reason'], $turn['history_count']])->toBe(['stored', null, 0])
            ->and($turn['messages'][1]['tool_calls'][0]['link'])->toBe('linked');
    });
});

describe('a delegation', function () {
    it('gives the tool call its tool span and the agent that span started', function () {
        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'ResearcherAgent', 'input' => ['task' => 'Dig']]]),
            FakeAnthropic::text('found it'),
            FakeAnthropic::text('Done'),
        ]);

        $run = (new AssistantAgent([new ResearcherAgent]))->prompt('Hi', model: FakeAnthropic::MODEL);
        $turn = ($this->turnOf)($run->invocationId);
        $spans = $this->getJson('/trail/api/traces/'.$run->invocationId)->json('data.spans');
        $tool = array_values(array_filter($spans, fn (array $span): bool => $span['type'] === 'tool'))[0];
        $agent = array_values(array_filter($spans, fn (array $span): bool => $span['type'] === 'agent' && $span['parent_id'] === $tool['id']))[0];
        $call = $turn['messages'][1]['tool_calls'][0];

        expect($call)->toMatchArray(['id' => 'toolu_1', 'name' => 'ResearcherAgent', 'link' => 'linked'])
            ->and($call['span']['id'])->toBe($tool['id'])
            ->and($call['agent'])->toBe([
                'span_id' => $agent['id'], 'name' => 'ResearcherAgent', 'agent_class' => ResearcherAgent::class, 'status' => 'completed', 'issue_kind' => null,
                'provider' => $agent['provider'], 'model' => $agent['model'], 'duration_ms' => $agent['duration_ms'], 'pending_approvals' => [], 'resolved_tool_call_ids' => [],
            ])->and($turn['messages_state'])->toBe('stored');

        // The agent's own steps are not this turn's messages.
        expect(array_column($turn['messages'], 'content'))->toBe(['Hi', '', null, 'Done']);
    });

    it('shows the tool of a sub-agent that failed as completed, and the agent as failed', function () {
        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'ResearcherAgent', 'input' => ['task' => 'Dig']]]),
            FakeAnthropic::error(500, 'Server error'),
            FakeAnthropic::text('Done'),
        ]);

        $turn = ($this->turnOf)((new AssistantAgent([new ResearcherAgent]))->prompt('Hi', model: FakeAnthropic::MODEL)->invocationId);
        $call = $turn['messages'][1]['tool_calls'][0];

        expect($turn['trace'])->toMatchArray(['status' => 'completed', 'child_failed' => true])
            ->and($call['span']['status'])->toBe('completed')
            ->and($call['agent'])->toMatchArray(['status' => 'failed', 'name' => 'ResearcherAgent'])
            ->and($turn['messages'][2]['tool_results'][0]['result'])->toStartWith('Agent failed: ');
    });
});

describe('approvals', function () {
    beforeEach(function () {
        $this->pause = function (?array $tools = null): array {
            FakeAnthropic::script([Approvals::turn()]);
            $paused = Approvals::agent($tools ?? [(new ApprovalTool)->requireApproval('Deletes data')], $this->user)->prompt('Delete the users', model: FakeAnthropic::MODEL);

            return [$paused, $paused->conversationId];
        };

        $this->resume = fn (string $conversation, mixed $decisions, array $script, ?Closure $handler = null) => (function () use ($conversation, $decisions, $script, $handler) {
            FakeAnthropic::script($script);

            return Approvals::agent([new ApprovalTool(handler: $handler)], $this->user, $conversation)->prompt($decisions, model: FakeAnthropic::MODEL);
        })();
    });

    it('shows a paused turn with the call it waits for and no span', function () {
        [, $conversation] = ($this->pause)();

        $turn = ($this->transcript)($conversation)['data']['turns'][0];

        expect($turn['trace']['status'])->toBe('awaiting_approval')
            ->and(array_column($turn['messages'], 'part'))->toBe(['prompt', 'activity'])
            ->and($turn['messages'][1]['tool_calls'])->toBe([[
                'id' => 'toolu_1', 'name' => 'delete_records', 'arguments' => ['table' => 'users'], 'link' => 'awaiting_approval', 'span' => null, 'agent' => null,
            ]])->and($turn['detail']['pending_approvals'][0]['tool_call_id'])->toBe('toolu_1')
            ->and($turn['messages_state'])->toBe('stored');
    });

    it('starts a resumed run at the merged tool result, with no prompt, and links the approved tool by its arguments', function () {
        [, $conversation] = ($this->pause)();
        $resumed = ($this->resume)($conversation, Decisions::from(['toolu_1' => true]), [FakeAnthropic::text('Deleted them')]);

        $body = ($this->transcript)($conversation);
        [$first, $turn] = $body['data']['turns'];
        $spans = $this->getJson('/trail/api/traces/'.$resumed->invocationId)->json('data.spans');
        $tool = array_values(array_filter($spans, fn (array $span): bool => $span['type'] === 'tool'))[0];

        expect(captureOutline($turn))->toBe([['activity', 'tool_result', null], ['response', 'assistant', 'Deleted them']])
            ->and($turn['history_count'])->toBe(2)
            ->and($turn['messages'][0]['tool_results'])->toBe([['id' => 'toolu_1', 'name' => 'delete_records', 'result' => 'Deleted users', 'span_id' => $tool['id']]])
            ->and($turn['detail']['resolved_tool_call_ids'])->toBe(['toolu_1'])
            ->and($turn['messages_state'])->toBe('stored')
            ->and(in_array('prompt', array_column($turn['messages'], 'part'), true))->toBeFalse()
            ->and($first['trace']['status'])->toBe('awaiting_approval');
    });

    it('gives a call that waits for approval no span when the conversation goes on', function () {
        [, $conversation] = ($this->pause)();
        ($this->resume)($conversation, Decisions::from(['toolu_1' => true]), [FakeAnthropic::text('Done')]);

        [$first] = ($this->transcript)($conversation)['data']['turns'];

        expect($first['messages'][1]['tool_calls'][0]['span'])->toBeNull();
    });

    it('has a rejection with a result as a tool result with no span', function () {
        [, $conversation] = ($this->pause)();
        ($this->resume)($conversation, Decisions::from(['toolu_1' => Decision::reject('Not allowed')]), [FakeAnthropic::text('Understood')]);

        $turn = ($this->transcript)($conversation)['data']['turns'][1];

        expect(captureOutline($turn))->toBe([['activity', 'tool_result', null], ['response', 'assistant', 'Understood']])
            ->and($turn['messages'][0]['tool_results'][0]['span_id'])->toBeNull()
            ->and($turn['messages'][0]['tool_results'][0]['result'])->toBeString()->not->toBe('');
    });

    it('has a bare rejection that is not stored at all', function () {
        [, $conversation] = ($this->pause)();
        ($this->resume)($conversation, Decisions::from(['toolu_1' => false]), [FakeAnthropic::text('Never asked')]);

        $turn = ($this->transcript)($conversation)['data']['turns'][1];

        expect($turn['messages'])->toBe([])
            ->and([$turn['messages_state'], $turn['messages_reason'], $turn['history_count']])->toBe(['not_stored', null, null])
            ->and($turn['trace']['status'])->toBe('completed');
    });

    it('settles every call with a wildcard, linking the approved tool and giving the other call of the first turn its own span', function () {
        FakeAnthropic::script([FakeAnthropic::toolUse([
            ['id' => 'toolu_1', 'name' => 'delete_records', 'input' => ['table' => 'users']],
            ['id' => 'toolu_2', 'name' => 'lookup', 'input' => ['query' => 'laravel']],
        ])]);
        $paused = Approvals::agent([new ApprovalTool, new LookupTool], $this->user)->prompt('Do both', model: FakeAnthropic::MODEL);
        $conversation = $paused->conversationId;

        FakeAnthropic::script([FakeAnthropic::text('Done')]);
        $resumed = Approvals::agent([new ApprovalTool, new LookupTool], $this->user, $conversation)->prompt(Decision::approveAll(), model: FakeAnthropic::MODEL);

        [$first, $second] = ($this->transcript)($conversation)['data']['turns'];
        $spans = $this->getJson('/trail/api/traces/'.$resumed->invocationId)->json('data.spans');
        $approved = array_values(array_filter($spans, fn (array $span): bool => $span['type'] === 'tool'))[0];

        // The first turn ran the ordinary tool itself, and holds the gated one back.
        expect(captureLinks($first['messages'][1]))->toBe(['awaiting_approval', 'linked'])
            ->and($second['detail']['resolved_tool_call_ids'])->toBe(['toolu_1'])
            ->and(array_column($second['messages'][0]['tool_results'], 'span_id', 'id'))->toBe(['toolu_2' => null, 'toolu_1' => $approved['id']])
            ->and(array_column($spans, 'type'))->toBe(['agent', 'tool', 'step']);
    });

    it('pauses a second time, with the settled call as a result and the new one waiting', function () {
        [, $conversation] = ($this->pause)();
        FakeAnthropic::script([Approvals::turn('toolu_3', 'orders')]);
        Approvals::agent([(new ApprovalTool)->requireApproval('Again')], $this->user, $conversation)->prompt(Decision::approveAll(), model: FakeAnthropic::MODEL);

        $turn = ($this->transcript)($conversation)['data']['turns'][1];

        expect($turn['trace']['status'])->toBe('awaiting_approval')
            ->and(array_column($turn['messages'], 'part'))->toBe(['activity', 'activity'])
            ->and($turn['messages'][0]['role'])->toBe('tool_result')
            ->and($turn['messages'][1]['tool_calls'][0])->toMatchArray(['id' => 'toolu_3', 'link' => 'awaiting_approval', 'span' => null])
            ->and($turn['detail']['resolved_tool_call_ids'])->toBe(['toolu_1'])
            ->and($turn['detail']['pending_approvals'][0]['tool_call_id'])->toBe('toolu_3');
    });

    it('puts the approvals of a sub-agent on the agent of its call', function () {
        [, $pausedConversation] = ($this->pause)();

        // A sub-agent that pauses on a gated tool, and one that resumes the paused conversation.
        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_a', 'name' => 'pause', 'input' => ['query' => 'x']], ['id' => 'toolu_b', 'name' => 'resume', 'input' => ['query' => 'y']]]),
            Approvals::turn('toolu_9', 'orders'),
            FakeAnthropic::text('Deleted them'),
            FakeAnthropic::text('Done'),
        ]);

        $pause = new CallbackTool('pause', fn () => (new RememberingAgent([(new ApprovalTool)->requireApproval('Sub')]))->forUser($this->user)->prompt('Delete', model: FakeAnthropic::MODEL)->text.'paused');
        $resume = new CallbackTool('resume', fn () => Approvals::agent([new ApprovalTool], $this->user, $pausedConversation)->prompt(Decisions::from(['toolu_1' => true]), model: FakeAnthropic::MODEL)->text);

        $run = (new AssistantAgent([$pause, $resume]))->prompt('Hi', model: FakeAnthropic::MODEL);
        $turn = ($this->turnOf)($run->invocationId);
        $calls = $turn['messages'][1]['tool_calls'];

        expect($calls[0]['agent']['pending_approvals'])->toBe([['tool_call_id' => 'toolu_9', 'tool' => 'delete_records', 'arguments' => ['table' => 'orders'], 'reason' => 'Sub']])
            ->and($calls[0]['agent']['resolved_tool_call_ids'])->toBe([])
            ->and($calls[1]['agent']['pending_approvals'])->toBe([])
            ->and($calls[1]['agent']['resolved_tool_call_ids'])->toBe(['toolu_1']);
    });
});
