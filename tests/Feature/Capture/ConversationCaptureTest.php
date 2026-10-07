<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Agents\BrokenParticipantAgent;
use Astro\Trail\Tests\Fixtures\Agents\RememberingAgent;
use Astro\Trail\Tests\Fixtures\Capture\Captured;
use Astro\Trail\Tests\Fixtures\Conversations\ConversationParticipant;
use Astro\Trail\Tests\Fixtures\Conversations\UuidParticipant;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Tools\CallbackTool;
use Astro\Trail\Tests\Fixtures\Tools\LookupTool;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\DB;
use Laravel\Ai\Concerns\RemembersConversations;
use Laravel\Ai\Events\AgentPrompted;
use Laravel\Ai\Events\PromptingAgent;
use Laravel\Ai\Models\Conversation;
use Laravel\Ai\Prompts\AgentPrompt;

/*
|--------------------------------------------------------------------------
| How the conversation and the user of a run are stored
|--------------------------------------------------------------------------
|
| The identity is read from the agent when the run starts and again when it
| ends. A new conversation only has an id once it has finished, so the start row
| knows the user but not the conversation.
|
*/

beforeEach(function () {
    $this->user = new ConversationParticipant;

    $this->read = function (string $id): Captured {
        Trail::flush();

        return Captured::read($id);
    };

    $this->identity = fn (Captured $run) => Captured::pick([$run->trace()], ['conversation_id', 'user_id', 'user_type'])[0];
});

describe('a new conversation', function () {
    it('is stored with the conversation id, the user and their type the SDK itself recorded', function () {
        FakeAnthropic::script([FakeAnthropic::text('Hello')]);

        $response = (new RememberingAgent)->forUser($this->user)->prompt('Hi');
        $run = ($this->read)($response->invocationId);
        $conversation = Conversation::query()->findOrFail($response->conversationId);

        expect(($this->identity)($run))->toBe([
            'conversation_id' => $response->conversationId,
            'user_id' => (string) $conversation->participant_id,
            'user_type' => $conversation->participant_type,
        ])->and($run->rawTrace()['user_id'])->toBe('42')
            ->and($run->rawTrace()['user_type'])->toBe(ConversationParticipant::class);
    });

    it('has the user but no conversation on the start row', function () {
        FakeAnthropic::script([FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'peek', 'input' => []]]), FakeAnthropic::text('Done')]);

        $seen = null;
        $peek = new CallbackTool('peek', function () use (&$seen) {
            $seen = (array) DB::table('trail_traces')->first();

            return 'ok';
        });

        $response = (new RememberingAgent([$peek]))->forUser($this->user)->prompt('Hi');

        expect([$seen['status'], $seen['conversation_id'], $seen['user_id'], $seen['user_type']])->toBe(['running', null, '42', ConversationParticipant::class])
            ->and(($this->identity)(($this->read)($response->invocationId))['conversation_id'])->toBe($response->conversationId);
    });

    it('is recorded the same way when streamed', function () {
        FakeAnthropic::script([FakeAnthropic::text('Hello')]);

        $stream = (new RememberingAgent)->forUser($this->user)->stream('Hi');
        foreach ($stream as $event) {
            // Consuming the stream is what runs the agent.
        }

        expect(($this->identity)(($this->read)($stream->invocationId))['conversation_id'])->toHaveLength(36);
    });
});

describe('a continued conversation', function () {
    it('has the conversation id on the start row, and two turns share it', function () {
        FakeAnthropic::script([FakeAnthropic::text('One'), FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'peek', 'input' => []]]), FakeAnthropic::text('Two')]);

        $first = (new RememberingAgent)->forUser($this->user)->prompt('Hi');

        $seen = null;
        $peek = new CallbackTool('peek', function () use (&$seen, $first) {
            $seen = DB::table('trail_traces')->where('conversation_id', $first->conversationId)->where('status', 'running')->value('conversation_id');

            return 'ok';
        });

        $second = (new RememberingAgent([$peek]))->continue($first->conversationId, as: $this->user)->prompt('Again');

        $one = ($this->read)($first->invocationId);
        $two = Captured::read($second->invocationId);

        expect($seen)->toBe($first->conversationId)
            ->and($second->invocationId)->not->toBe($first->invocationId)
            ->and(($this->identity)($one))->toBe(($this->identity)($two))
            ->and(($this->identity)($two)['conversation_id'])->toBe($first->conversationId);
    });

    it('has the conversation but no user when it is continued without one', function () {
        FakeAnthropic::script([FakeAnthropic::text('One'), FakeAnthropic::text('Two')]);

        $first = (new RememberingAgent)->forUser($this->user)->prompt('Hi');
        $second = (new RememberingAgent)->continue($first->conversationId)->prompt('Again');

        expect(($this->identity)(($this->read)($second->invocationId)))->toBe([
            'conversation_id' => $first->conversationId, 'user_id' => null, 'user_type' => null,
        ]);
    });
});

describe('a failed turn', function () {
    it('has the user but no conversation when a new conversation fails on its first step', function () {
        FakeAnthropic::script([FakeAnthropic::error(500, 'Provider down')]);

        expect(fn () => (new RememberingAgent)->forUser($this->user)->prompt('Hi'))->toThrow(RequestException::class);

        expect(($this->identity)(($this->read)($this->sdk->invocationIds()[0])))->toBe([
            'conversation_id' => null, 'user_id' => '42', 'user_type' => ConversationParticipant::class,
        ]);
    });

    it('has the conversation id when a new conversation fails after a completed step', function () {
        FakeAnthropic::script([FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'x']]]), FakeAnthropic::error(500, 'Provider down')]);

        $agent = (new RememberingAgent([new LookupTool]))->forUser($this->user);

        expect(fn () => $agent->prompt('Hi'))->toThrow(RequestException::class);

        $run = ($this->read)($this->sdk->invocationIds()[0]);

        expect($run->rawTrace()['conversation_id'])->toBe($agent->currentConversation())
            ->and($run->rawTrace()['conversation_id'])->toHaveLength(36)
            ->and($run->rawTrace()['user_id'])->toBe('42');
    });
});

describe('a run without an identity', function () {
    it('has no conversation and no user', function () {
        AssistantAgent::fake(['Hello']);

        $response = (new AssistantAgent)->prompt('Hi');

        expect(($this->identity)(($this->read)($response->invocationId)))->toBe(['conversation_id' => null, 'user_id' => null, 'user_type' => null]);
    });

    it('runs normally when the agent\'s conversation methods throw', function () {
        AssistantAgent::fake(['Hello']);
        BrokenParticipantAgent::fake(['Hello']);

        $response = (new BrokenParticipantAgent)->prompt('Hi');

        expect($response->text)->toBe('Hello')
            ->and(($this->identity)(($this->read)($response->invocationId)))->toBe(['conversation_id' => null, 'user_id' => null, 'user_type' => null]);
    });

    it('describes the root, not a sub-agent that remembers its conversation', function () {
        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'ask', 'input' => []]]),
            FakeAnthropic::text('found it'),
            FakeAnthropic::text('Done'),
        ]);

        $ask = new CallbackTool('ask', fn () => (new RememberingAgent)->forUser($this->user)->prompt('Dig')->text);

        $response = (new AssistantAgent([$ask]))->prompt('Hi');
        $run = ($this->read)($response->invocationId);

        expect(($this->identity)($run))->toBe(['conversation_id' => null, 'user_id' => null, 'user_type' => null])
            ->and(Conversation::query()->count())->toBe(1);
    });
});

it('never replaces a known conversation id with an unknown one at the end of the run', function () {
    AssistantAgent::fake(['Hello']);
    (new AssistantAgent)->prompt('Hi');

    $prompting = $this->sdk->sole(PromptingAgent::class)->event;
    $prompted = $this->sdk->sole(AgentPrompted::class)->event;
    $original = $prompting->prompt;
    $id = 'hand-built-run';

    $remembers = new class extends AssistantAgent
    {
        use RemembersConversations;

        public function currentConversation(): ?string
        {
            return 'conversation-1';
        }

        public function conversationParticipant(): ?object
        {
            return null;
        }
    };

    $forgets = new class extends AssistantAgent
    {
        use RemembersConversations;

        public function currentConversation(): ?string
        {
            return null;
        }

        public function conversationParticipant(): ?object
        {
            return null;
        }
    };

    $start = new AgentPrompt($remembers, 'Hi', [], $original->provider, $original->model);
    $end = new AgentPrompt($forgets, 'Hi', [], $original->provider, $original->model);

    event(new PromptingAgent($id, $start));
    event(new AgentPrompted($id, $end, $prompted->response));

    expect(($this->identity)(($this->read)($id))['conversation_id'])->toBe('conversation-1');
});

describe('identity read from hand-built events', function () {
    beforeEach(function () {
        AssistantAgent::fake(['Hello']);
        (new AssistantAgent)->prompt('Hi');

        $this->original = $this->sdk->sole(PromptingAgent::class)->event->prompt;
        $this->response = $this->sdk->sole(AgentPrompted::class)->event->response;

        /** An agent whose conversation and participant are the given ones. */
        $this->agentOf = fn (?string $conversation, ?object $participant) => new class($conversation, $participant) extends AssistantAgent
        {
            use RemembersConversations;

            public function __construct(private ?string $conversation, private ?object $participant)
            {
                parent::__construct();
            }

            public function currentConversation(): ?string
            {
                return $this->conversation;
            }

            public function conversationParticipant(): ?object
            {
                return $this->participant;
            }
        };

        /** Start and end a run with the given agents, using the real response of the earlier run. */
        $this->handBuilt = function (string $id, object $start, object $end): array {
            event(new PromptingAgent($id, new AgentPrompt($start, 'Hi', [], $this->original->provider, $this->original->model)));
            event(new AgentPrompted($id, new AgentPrompt($end, 'Hi', [], $this->original->provider, $this->original->model), $this->response));

            return ($this->identity)(($this->read)($id));
        };
    });

    it('keeps a known user when the end of the run reports none', function () {
        $identity = ($this->handBuilt)('known-user', ($this->agentOf)(null, $this->user), ($this->agentOf)(null, null));

        expect($identity)->toBe(['conversation_id' => null, 'user_id' => '42', 'user_type' => ConversationParticipant::class]);
    });

    it('stores an integer key and a string key as strings', function (Closure $make, string $expected) {
        $participant = $make();
        $agent = ($this->agentOf)(null, $participant);

        expect(($this->handBuilt)('key-'.$expected, $agent, $agent))->toBe(['conversation_id' => null, 'user_id' => $expected, 'user_type' => $participant::class]);
    })->with([
        'an integer' => [fn () => new ConversationParticipant(7), '7'],
        'a uuid' => [fn () => new UuidParticipant, '0198c2a4-7b1e-7c3a-9d52-3f6a1e8b4c70'],
    ]);

    it('has neither a user id nor a user type for a participant without a key, and the run is unaffected', function () {
        $agent = ($this->agentOf)(null, new stdClass);

        $identity = ($this->handBuilt)('keyless', $agent, $agent);

        expect($identity)->toBe(['conversation_id' => null, 'user_id' => null, 'user_type' => null])
            ->and(Captured::read('keyless')->rawTrace()['status'])->toBe('completed');
    });
});

it('describes the root, not a sub-agent with a participant of its own', function () {
    FakeAnthropic::script([
        FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'ask', 'input' => []]]),
        FakeAnthropic::text('found it'),
        FakeAnthropic::text('Done'),
    ]);

    $ask = new CallbackTool('ask', fn () => (new RememberingAgent)->forUser(new ConversationParticipant(7))->prompt('Dig')->text);

    $response = (new RememberingAgent([$ask]))->forUser($this->user)->prompt('Hi');
    $run = ($this->read)($response->invocationId);

    expect(($this->identity)($run))->toBe([
        'conversation_id' => $response->conversationId,
        'user_id' => '42',
        'user_type' => ConversationParticipant::class,
    ])->and(Conversation::query()->count())->toBe(2);
});
