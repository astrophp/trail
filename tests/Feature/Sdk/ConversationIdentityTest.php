<?php

use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Agents\RememberingAgent;
use Astro\Trail\Tests\Fixtures\Conversations\ConversationParticipant;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Sdk\RecordedEvent;
use Astro\Trail\Tests\Fixtures\Tools\LookupTool;
use Illuminate\Http\Client\RequestException;
use Laravel\Ai\Events\AgentFailed;
use Laravel\Ai\Events\AgentPrompted;
use Laravel\Ai\Events\AgentStreamed;
use Laravel\Ai\Events\PromptingAgent;
use Laravel\Ai\Models\Conversation;
use Laravel\Ai\Models\ConversationMessage;

/*
|--------------------------------------------------------------------------
| When the conversation id and the user become readable
|--------------------------------------------------------------------------
|
| A conversation id lives on the agent (currentConversation()) and on the
| terminal response, not on the events themselves. For a new remembered
| conversation the SDK only creates the id once the run has finished, so
| most events of the run cannot see it. Values here are read from the
| RecordedEvent captured at dispatch time, because the live agent keeps
| changing after the event.
|
*/

/**
 * A call that takes a tool step and then answers.
 */
function conversationToolTurns(): array
{
    return [
        FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'laravel']]]),
        FakeAnthropic::text('Done'),
    ];
}

/**
 * The conversation id the agent exposed at the time of each event, keyed by event label position.
 *
 * @param  list<RecordedEvent>  $entries
 * @return list<?string>
 */
function conversationIdsSeen(array $entries): array
{
    return array_map(fn (RecordedEvent $entry): ?string => $entry->agentConversationId, $entries);
}

beforeEach(function () {
    $this->migrateSdkTables();

    $this->user = new ConversationParticipant;
});

describe('a new remembered conversation', function () {
    it('has no conversation id until the terminal event', function () {
        FakeAnthropic::script(conversationToolTurns());

        $response = (new RememberingAgent([new LookupTool]))->forUser($this->user)->prompt('Hi');

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'InvokingTool(lookup)',
            'ToolInvoked(lookup)',
            'StartingStep#1',
            'StepCompleted#1',
            'AgentPrompted',
        ])->and(conversationIdsSeen($this->sdk->all()))->toBe([
            null, null, null, null, null, null, null, $response->conversationId,
        ])->and($response->conversationId)->toHaveLength(36);
    });

    it('puts the id on the terminal event response and on the agent at that moment', function () {
        FakeAnthropic::script([FakeAnthropic::text('Hello')]);

        $agent = (new RememberingAgent)->forUser($this->user);
        $response = $agent->prompt('Hi');

        $prompted = $this->sdk->sole(AgentPrompted::class);

        expect($prompted->responseConversationId)->toBe($response->conversationId)
            ->and($prompted->agentConversationId)->toBe($response->conversationId)
            ->and($agent->currentConversation())->toBe($response->conversationId)
            ->and($response->conversationUser)->toBe($this->user);
    });

    it('stores the conversation under the id the response reports', function () {
        FakeAnthropic::script([FakeAnthropic::text('Hello')]);

        $response = (new RememberingAgent)->forUser($this->user)->prompt('Hi');

        $conversation = Conversation::query()->findOrFail($response->conversationId);

        expect(Conversation::query()->count())->toBe(1)
            ->and($conversation->participant_type)->toBe(ConversationParticipant::class)
            ->and((int) $conversation->participant_id)->toBe($this->user->id)
            ->and(ConversationMessage::query()->pluck('role')->sort()->values()->all())->toBe(['assistant', 'user']);
    });

    it('makes the user readable on every event from the first one', function () {
        FakeAnthropic::script(conversationToolTurns());

        (new RememberingAgent([new LookupTool]))->forUser($this->user)->prompt('Hi');

        foreach ($this->sdk->all() as $entry) {
            expect($entry->agentConversationUser)->toBe($this->user);
        }
    });

    it('exposes the id only on the terminal event of a streamed run too', function () {
        FakeAnthropic::script([FakeAnthropic::text('Hello')]);

        $stream = (new RememberingAgent)->forUser($this->user)->stream('Hi');

        foreach ($stream as $event) {
            // Consuming the stream is what runs the agent...
        }

        $streamed = $this->sdk->sole(AgentStreamed::class);

        expect($this->sdk->timeline())->toBe(['StreamingAgent', 'StartingStep#0', 'StepCompleted#0', 'AgentStreamed'])
            ->and(conversationIdsSeen($this->sdk->all()))->toBe([null, null, null, $streamed->responseConversationId])
            ->and($streamed->responseConversationId)->toHaveLength(36);
    });
});

describe('a continued conversation', function () {
    it('has the id from the first event to the last, and the response reports the same one', function () {
        FakeAnthropic::script([FakeAnthropic::text('One'), ...conversationToolTurns()]);

        $first = (new RememberingAgent)->forUser($this->user)->prompt('Hi');

        $this->sdk->clear();

        $second = (new RememberingAgent([new LookupTool]))->continue($first->conversationId, as: $this->user)->prompt('Again');

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'InvokingTool(lookup)',
            'ToolInvoked(lookup)',
            'StartingStep#1',
            'StepCompleted#1',
            'AgentPrompted',
        ])->and(array_unique(conversationIdsSeen($this->sdk->all())))->toBe([$first->conversationId])
            ->and($second->conversationId)->toBe($first->conversationId)
            ->and($this->sdk->sole(AgentPrompted::class)->responseConversationId)->toBe($first->conversationId)
            ->and(Conversation::query()->count())->toBe(1);
    });

    it('keeps one conversation id but a new invocation id for every turn', function () {
        FakeAnthropic::script([FakeAnthropic::text('One'), FakeAnthropic::text('Two')]);

        $first = (new RememberingAgent)->forUser($this->user)->prompt('Hi');
        $second = (new RememberingAgent)->continue($first->conversationId, as: $this->user)->prompt('Again');

        expect($second->conversationId)->toBe($first->conversationId)
            ->and($second->invocationId)->not->toBe($first->invocationId)
            ->and($this->sdk->invocationIds())->toBe([$first->invocationId, $second->invocationId]);
    });

    it('reports no user when the conversation is continued without one', function () {
        FakeAnthropic::script([FakeAnthropic::text('One'), FakeAnthropic::text('Two')]);

        $first = (new RememberingAgent)->forUser($this->user)->prompt('Hi');

        $this->sdk->clear();

        $second = (new RememberingAgent)->continue($first->conversationId)->prompt('Again');

        expect($this->sdk->sole(PromptingAgent::class)->agentConversationId)->toBe($first->conversationId)
            ->and($this->sdk->sole(PromptingAgent::class)->agentConversationUser)->toBeNull()
            ->and($second->conversationId)->toBe($first->conversationId)
            ->and($second->conversationUser)->toBeNull();
    });
});

describe('a failed turn', function () {
    it('is not stored and has no id when a new conversation fails on its first step', function () {
        FakeAnthropic::script([FakeAnthropic::error(500, 'Provider down')]);

        expect(fn () => (new RememberingAgent)->forUser($this->user)->prompt('Hi'))->toThrow(RequestException::class);

        $failed = $this->sdk->sole(AgentFailed::class);

        expect($this->sdk->timeline())->toBe(['PromptingAgent', 'StartingStep#0', 'StepFailed#0', 'AgentFailed'])
            ->and(conversationIdsSeen($this->sdk->all()))->toBe([null, null, null, null])
            ->and($failed->agentConversationUser)->toBe($this->user)
            ->and(Conversation::query()->count())->toBe(0)
            ->and(ConversationMessage::query()->count())->toBe(0);
    });

    it('is stored and has its id on AgentFailed when a new conversation fails after a completed step', function () {
        FakeAnthropic::script([...array_slice(conversationToolTurns(), 0, 1), FakeAnthropic::error(500, 'Provider down')]);

        $agent = (new RememberingAgent([new LookupTool]))->forUser($this->user);

        expect(fn () => $agent->prompt('Hi'))->toThrow(RequestException::class);

        $failed = $this->sdk->sole(AgentFailed::class);

        // The id is created while the failure unwinds through the remembering middleware, just before AgentFailed...
        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'InvokingTool(lookup)',
            'ToolInvoked(lookup)',
            'StartingStep#1',
            'StepFailed#1',
            'AgentFailed',
        ])->and(conversationIdsSeen($this->sdk->all()))->toBe([null, null, null, null, null, null, null, $agent->currentConversation()])
            ->and($failed->agentConversationId)->toHaveLength(36)
            ->and($failed->agentConversationUser)->toBe($this->user)
            ->and($failed->event->prompt->agent->currentConversation())->toBe($failed->agentConversationId)
            ->and(Conversation::query()->findOrFail($failed->agentConversationId))->not->toBeNull()
            ->and(ConversationMessage::query()->get()->mapWithKeys(fn ($message) => [$message->role => $message->status->value])->all())
            ->toBe(['user' => 'completed', 'assistant' => 'failed']);
    });

    it('has the id from the start but is not stored when a continued conversation fails on its first step', function () {
        FakeAnthropic::script([FakeAnthropic::text('One'), FakeAnthropic::error(500, 'Provider down')]);

        $first = (new RememberingAgent)->forUser($this->user)->prompt('Hi');

        $this->sdk->clear();

        expect(fn () => (new RememberingAgent)->continue($first->conversationId, as: $this->user)->prompt('Again'))
            ->toThrow(RequestException::class);

        expect($this->sdk->timeline())->toBe(['PromptingAgent', 'StartingStep#0', 'StepFailed#0', 'AgentFailed'])
            ->and(array_unique(conversationIdsSeen($this->sdk->all())))->toBe([$first->conversationId])
            ->and(ConversationMessage::query()->count())->toBe(2);
    });

    it('is stored against the same conversation when a continued conversation fails after a completed step', function () {
        FakeAnthropic::script([FakeAnthropic::text('One'), ...array_slice(conversationToolTurns(), 0, 1), FakeAnthropic::error(500, 'Provider down')]);

        $first = (new RememberingAgent)->forUser($this->user)->prompt('Hi');

        $this->sdk->clear();

        expect(fn () => (new RememberingAgent([new LookupTool]))->continue($first->conversationId, as: $this->user)->prompt('Again'))
            ->toThrow(RequestException::class);

        expect(array_unique(conversationIdsSeen($this->sdk->all())))->toBe([$first->conversationId])
            ->and($this->sdk->sole(AgentFailed::class)->agentConversationUser)->toBe($this->user)
            ->and(Conversation::query()->count())->toBe(1)
            ->and(ConversationMessage::query()->count())->toBe(4)
            ->and(ConversationMessage::query()->where('status', 'failed')->count())->toBe(1);
    });
});

describe('an agent with no conversation identity', function () {
    it('has no id and no user anywhere when a remembering agent has no participant', function () {
        FakeAnthropic::script(conversationToolTurns());

        $response = (new RememberingAgent([new LookupTool]))->prompt('Hi');

        foreach ($this->sdk->all() as $entry) {
            expect($entry->agentConversationId)->toBeNull()
                ->and($entry->agentConversationUser)->toBeNull()
                ->and($entry->responseConversationId)->toBeNull();
        }

        expect($response->conversationId)->toBeNull()
            ->and($response->conversationUser)->toBeNull()
            ->and(Conversation::query()->count())->toBe(0)
            ->and(ConversationMessage::query()->count())->toBe(0);
    });

    it('has no id and no user anywhere when the agent does not remember conversations', function () {
        FakeAnthropic::script(conversationToolTurns());

        $response = (new AssistantAgent([new LookupTool]))->prompt('Hi');

        foreach ($this->sdk->all() as $entry) {
            expect($entry->agentConversationId)->toBeNull()
                ->and($entry->agentConversationUser)->toBeNull()
                ->and($entry->responseConversationId)->toBeNull();
        }

        expect($response->conversationId)->toBeNull()
            ->and($response->conversationUser)->toBeNull();
    });

    it('has no id when a failed run belongs to no conversation', function () {
        FakeAnthropic::script([...array_slice(conversationToolTurns(), 0, 1), FakeAnthropic::error(500, 'Provider down')]);

        expect(fn () => (new RememberingAgent([new LookupTool]))->prompt('Hi'))->toThrow(RequestException::class);

        expect($this->sdk->sole(AgentFailed::class)->agentConversationId)->toBeNull()
            ->and(Conversation::query()->count())->toBe(0);
    });
});

describe('conversation title generation', function () {
    beforeEach(function () {
        config(['ai.conversations.generate_title' => true]);
    });

    it('makes one more model call for a new conversation that no SDK event reports', function () {
        $anthropic = FakeAnthropic::script([FakeAnthropic::text('Hello'), FakeAnthropic::text('A Short Title')]);

        $response = (new RememberingAgent)->forUser($this->user)->prompt('Hi');

        $requests = $anthropic->requests();

        expect($this->sdk->timeline())->toBe(['PromptingAgent', 'StartingStep#0', 'StepCompleted#0', 'AgentPrompted'])
            ->and($requests)->toHaveCount(2)
            ->and($anthropic->remaining())->toBe(0)
            ->and($requests[0]['system'])->toBe('You remember conversations.')
            ->and($requests[1]['system'])->toContain('3-5 word title')
            ->and($requests[1]['messages'][0]['content'][0]['text'])->toBe('Hi')
            ->and($response->usage->inputTokens)->toBe(10)
            ->and(Conversation::query()->findOrFail($response->conversationId)->title)->toBe('A Short Title');
    });

    it('does not call the model for a title when the conversation already exists', function () {
        $anthropic = FakeAnthropic::script([FakeAnthropic::text('One'), FakeAnthropic::text('A Short Title'), FakeAnthropic::text('Two')]);

        $first = (new RememberingAgent)->forUser($this->user)->prompt('Hi');

        $this->sdk->clear();

        (new RememberingAgent)->continue($first->conversationId, as: $this->user)->prompt('Again');

        expect($anthropic->requests())->toHaveCount(3)
            ->and($anthropic->requests()[2]['system'])->toBe('You remember conversations.');
    });

    it('falls back to the prompt as the title and fires no failure event when the title call fails', function () {
        $anthropic = FakeAnthropic::script([FakeAnthropic::text('Hello'), FakeAnthropic::error(500, 'Provider down')]);

        $response = (new RememberingAgent)->forUser($this->user)->prompt('Hi');

        expect($this->sdk->timeline())->toBe(['PromptingAgent', 'StartingStep#0', 'StepCompleted#0', 'AgentPrompted'])
            ->and($anthropic->requests())->toHaveCount(2)
            ->and(Conversation::query()->findOrFail($response->conversationId)->title)->toBe('Hi');
    });
});
