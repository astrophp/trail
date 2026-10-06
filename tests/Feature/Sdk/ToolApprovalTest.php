<?php

use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Agents\RememberingAgent;
use Astro\Trail\Tests\Fixtures\Conversations\ConversationParticipant;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Tools\ApprovalTool;
use Astro\Trail\Tests\Fixtures\Tools\LookupTool;
use Laravel\Ai\Approvals\Decision;
use Laravel\Ai\Approvals\Decisions;
use Laravel\Ai\Approvals\PendingApproval;
use Laravel\Ai\Events\AgentFailed;
use Laravel\Ai\Events\AgentPrompted;
use Laravel\Ai\Events\InvokingTool;
use Laravel\Ai\Events\PromptingAgent;
use Laravel\Ai\Events\ToolApprovalRequested;
use Laravel\Ai\Events\ToolApprovalResolved;
use Laravel\Ai\Events\ToolFailed;
use Laravel\Ai\Events\ToolInvoked;
use Laravel\Ai\Exceptions\ApprovalNotResumableException;
use Laravel\Ai\Models\ConversationMessage;
use Laravel\Ai\Responses\Data\FinishReason;
use Laravel\Ai\Responses\Data\ToolResult;

/*
|--------------------------------------------------------------------------
| Tool approvals: a run that pauses and the run that resumes it
|--------------------------------------------------------------------------
|
| A tool that asks for approval does not run. The run ends with pending
| approvals instead of a final answer, and the host app later calls
| ->prompt(Decisions::from([...])) to resume it. That resume is a new
| invocation, not a continuation of the paused one.
|
| Resumption is skipped for agents faked with Agent::fake(), so every test
| here drives the real Anthropic gateway through FakeAnthropic. The remembered
| conversation is what carries the paused turn between the two calls.
|
*/

/**
 * A remembering agent for one user, with the given tools.
 */
function approvalAgent(array $tools, ConversationParticipant $user, ?string $conversationId = null): RememberingAgent
{
    $agent = new RememberingAgent($tools);

    return $conversationId === null ? $agent->forUser($user) : $agent->continue($conversationId, as: $user);
}

/**
 * One scripted turn asking for the approval-gated tool.
 */
function approvalToolTurn(string $id = 'toolu_1', string $table = 'users'): array
{
    return FakeAnthropic::toolUse([['id' => $id, 'name' => 'delete_records', 'input' => ['table' => $table]]]);
}

/**
 * The status of the stored user and assistant messages, keyed by role.
 *
 * @return array<string, string>
 */
function approvalStatuses(): array
{
    return ConversationMessage::query()->get()->mapWithKeys(fn ($message) => [$message->role => $message->status->value])->all();
}

describe('a run that pauses', function () {
    beforeEach(function () {
        $this->migrateSdkTables();

        $this->user = new ConversationParticipant;
    });

    it('ends the run with pending approvals instead of running the tool', function () {
        $handled = 0;
        $anthropic = FakeAnthropic::script([approvalToolTurn()]);

        $response = approvalAgent([new ApprovalTool(handler: function () use (&$handled) {
            $handled++;

            return 'never';
        })], $this->user)->prompt('Delete the users');

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'AgentPrompted',
            'ToolApprovalRequested',
        ])->and($handled)->toBe(0)
            ->and($response->hasPendingApprovals())->toBeTrue()
            ->and($anthropic->requests())->toHaveCount(1);
    });

    it('fires AgentPrompted for the paused run with the pending approvals on its response', function () {
        FakeAnthropic::script([approvalToolTurn()]);

        $response = approvalAgent([new ApprovalTool], $this->user)->prompt('Delete the users');

        $prompted = $this->sdk->sole(AgentPrompted::class)->event;

        expect($prompted->response)->toBe($response)
            ->and($prompted->response->hasPendingApprovals())->toBeTrue()
            ->and($prompted->response->pendingApprovals->toArray())->toBe([
                ['id' => 'toolu_1', 'tool' => 'delete_records', 'arguments' => ['table' => 'users'], 'reason' => null],
            ]);
    });

    it('carries the pending approval, the conversation and the user on ToolApprovalRequested', function () {
        FakeAnthropic::script([approvalToolTurn()]);

        $agent = approvalAgent([(new ApprovalTool)->requireApproval('Deletes data')], $this->user);
        $response = $agent->prompt('Delete the users');

        $requested = $this->sdk->sole(ToolApprovalRequested::class)->event;

        expect($requested->invocationId)->toBe($response->invocationId)
            ->and($requested->agent)->toBe($agent)
            ->and($requested->pendingApprovals)->toHaveCount(1)
            ->and($requested->pendingApprovals[0])->toBeInstanceOf(PendingApproval::class)
            ->and($requested->pendingApprovals->toArray())->toBe([
                ['id' => 'toolu_1', 'tool' => 'delete_records', 'arguments' => ['table' => 'users'], 'reason' => 'Deletes data'],
            ])
            ->and($requested->conversationId)->toBe($response->conversationId)
            ->and($requested->conversationId)->toHaveLength(36)
            ->and($requested->conversationUser)->toBe($this->user);
    });

    it('returns an empty answer with the paused step, its tool call and no tool result', function () {
        FakeAnthropic::script([approvalToolTurn()]);

        $response = approvalAgent([new ApprovalTool], $this->user)->prompt('Delete the users');

        expect($response->text)->toBe('')
            ->and($response->steps)->toHaveCount(1)
            ->and($response->steps[0]->finishReason)->toBe(FinishReason::ToolCalls)
            ->and($response->toolCalls)->toHaveCount(1)
            ->and($response->toolCalls[0]->id)->toBe('toolu_1')
            ->and($response->toolCalls[0]->name)->toBe('delete_records')
            ->and($response->toolResults)->toHaveCount(0);
    });

    it('runs the ordinary tool calls of the same step and holds back only the gated one', function () {
        FakeAnthropic::script([
            FakeAnthropic::toolUse([
                ['id' => 'toolu_1', 'name' => 'delete_records', 'input' => ['table' => 'users']],
                ['id' => 'toolu_2', 'name' => 'lookup', 'input' => ['query' => 'laravel']],
            ]),
        ]);

        $response = approvalAgent([new ApprovalTool, new LookupTool], $this->user)->prompt('Do both');

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'InvokingTool(lookup)',
            'ToolInvoked(lookup)',
            'AgentPrompted',
            'ToolApprovalRequested',
        ])->and($response->toolCalls->pluck('id')->all())->toBe(['toolu_1', 'toolu_2'])
            ->and($response->toolResults->pluck('id')->all())->toBe(['toolu_2'])
            ->and($response->toolResults[0]->result)->toBe('Result for laravel')
            ->and($response->pendingApprovals->pluck('id')->all())->toBe(['toolu_1']);
    });

    it('stores the paused turn as a paused assistant message', function () {
        FakeAnthropic::script([approvalToolTurn()]);

        approvalAgent([new ApprovalTool], $this->user)->prompt('Delete the users');

        expect(approvalStatuses())
            ->toBe(['user' => 'completed', 'assistant' => 'paused']);
    });

    it('fires the streamed equivalent as StreamingAgent, AgentStreamed and ToolApprovalRequested', function () {
        FakeAnthropic::script([approvalToolTurn()]);

        $stream = approvalAgent([new ApprovalTool], $this->user)->stream('Delete the users');

        $streamed = [];

        foreach ($stream as $event) {
            $streamed[] = class_basename($event);
        }

        expect($streamed)->toBe(['StreamStart', 'ToolCall', 'ToolApprovalRequest', 'StreamEnd'])
            ->and($this->sdk->timeline())->toBe([
                'StreamingAgent',
                'StartingStep#0',
                'StepCompleted#0',
                'AgentStreamed',
                'ToolApprovalRequested',
            ])->and($this->sdk->sole(ToolApprovalRequested::class)->event->conversationId)->toHaveLength(36);
    });
});

describe('a pause that cannot be resumed', function () {
    it('fails the run when the agent is neither conversational nor given a history', function () {
        FakeAnthropic::script([approvalToolTurn()]);

        $thrown = null;

        try {
            (new AssistantAgent([new ApprovalTool]))->prompt('Delete the users');
        } catch (ApprovalNotResumableException $exception) {
            $thrown = $exception;
        }

        // The step completed and the tool was held back before the SDK noticed nothing could resume it...
        expect($thrown)->toBeInstanceOf(ApprovalNotResumableException::class)
            ->and($this->sdk->timeline())->toBe([
                'PromptingAgent',
                'StartingStep#0',
                'StepCompleted#0',
                'AgentFailed',
            ])->and($this->sdk->sole(AgentFailed::class)->event->exception)->toBe($thrown);
    });

    it('pauses normally when the agent is given an ad-hoc history', function () {
        FakeAnthropic::script([approvalToolTurn()]);

        $response = (new AssistantAgent([new ApprovalTool]))->withMessages([])->prompt('Delete the users');

        $requested = $this->sdk->sole(ToolApprovalRequested::class)->event;

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'AgentPrompted',
            'ToolApprovalRequested',
        ])->and($response->hasPendingApprovals())->toBeTrue()
            ->and($requested->conversationId)->toBeNull()
            ->and($requested->conversationUser)->toBeNull();
    });
});

describe('a run that resumes', function () {
    beforeEach(function () {
        $this->migrateSdkTables();

        $this->user = new ConversationParticipant;
        $this->handled = [];

        $this->tool = fn () => new ApprovalTool(handler: function ($request) {
            $this->handled[] = $request->all();

            return 'Deleted '.$request['table'];
        });

        FakeAnthropic::script([approvalToolTurn()]);

        // The host app pauses in one request and resumes in a later one, with a fresh agent that continues the stored conversation...
        $this->paused = approvalAgent([($this->tool)()], $this->user)->prompt('Delete the users');
        $this->pausedEvents = $this->sdk->all();

        $this->sdk->clear();

        $this->resumer = fn () => approvalAgent([($this->tool)()], $this->user, $this->paused->conversationId);
    });

    it('runs an approved tool before the first step, then lets the model answer', function () {
        $anthropic = FakeAnthropic::script([FakeAnthropic::text('Deleted them')]);

        $response = ($this->resumer)()->prompt(Decisions::from(['toolu_1' => true]));

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'InvokingTool(delete_records)',
            'ToolInvoked(delete_records)',
            'StartingStep#0',
            'StepCompleted#0',
            'AgentPrompted',
            'ToolApprovalResolved',
        ])->and($response->text)->toBe('Deleted them')
            ->and($response->hasPendingApprovals())->toBeFalse()
            ->and($this->handled)->toBe([['table' => 'users']])
            ->and($anthropic->requests())->toHaveCount(1);

        // The model is shown the approved tool's result as the last message...
        $messages = $anthropic->requests()[0]['messages'];
        $last = end($messages);

        expect($last['role'])->toBe('user')
            ->and($last['content'][0]['type'])->toBe('tool_result')
            ->and($last['content'][0]['tool_use_id'])->toBe('toolu_1')
            ->and($last['content'][0]['content'])->toBe('Deleted users');
    });

    it('starts a new invocation for the resume', function () {
        FakeAnthropic::script([FakeAnthropic::text('Deleted them')]);

        $response = ($this->resumer)()->prompt(Decisions::from(['toolu_1' => true]));

        expect($response->invocationId)->not->toBe($this->paused->invocationId)
            ->and($this->sdk->invocationIds())->toBe([$response->invocationId]);
    });

    it('fires PromptingAgent for the resume with decisions and no prompt text', function () {
        FakeAnthropic::script([FakeAnthropic::text('Deleted them')]);

        $decisions = Decisions::from(['toolu_1' => true]);

        ($this->resumer)()->prompt($decisions);

        $prompt = $this->sdk->sole(PromptingAgent::class)->event->prompt;

        expect($prompt->prompt)->toBe('')
            ->and($prompt->hasApprovalDecisions())->toBeTrue()
            ->and($prompt->approvalDecisions)->toBe($decisions)
            ->and($prompt->approvalDecisions->get('toolu_1')->isApproved())->toBeTrue();
    });

    it('carries the executed result, the conversation and the user on ToolApprovalResolved, after AgentPrompted', function () {
        FakeAnthropic::script([FakeAnthropic::text('Deleted them')]);

        $agent = ($this->resumer)();
        $response = $agent->prompt(Decisions::from(['toolu_1' => true]));

        $resolved = $this->sdk->sole(ToolApprovalResolved::class)->event;

        expect($resolved->invocationId)->toBe($response->invocationId)
            ->and($resolved->agent)->toBe($agent)
            ->and($resolved->toolResults)->toHaveCount(1)
            ->and($resolved->toolResults[0])->toBeInstanceOf(ToolResult::class)
            ->and($resolved->toolResults[0]->id)->toBe('toolu_1')
            ->and($resolved->toolResults[0]->name)->toBe('delete_records')
            ->and($resolved->toolResults[0]->arguments)->toBe(['table' => 'users'])
            ->and($resolved->toolResults[0]->result)->toBe('Deleted users')
            ->and($resolved->toolResults[0]->denied)->toBeFalse()
            ->and($resolved->toolResults[0]->failed)->toBeFalse()
            ->and($resolved->conversationId)->toBe($this->paused->conversationId)
            ->and($resolved->conversationUser)->toBe($this->user);
    });

    it('lists the approved tool result on the resumed response without the call that produced it', function () {
        FakeAnthropic::script([FakeAnthropic::text('Deleted them')]);

        $response = ($this->resumer)()->prompt(Decisions::from(['toolu_1' => true]));

        // The call was made by the paused run, so this run's response and step hold the result alone...
        expect($response->steps)->toHaveCount(1)
            ->and($response->steps[0]->toolCalls)->toHaveCount(0)
            ->and($response->toolCalls)->toHaveCount(0)
            ->and($response->toolResults->pluck('id')->all())->toBe(['toolu_1'])
            ->and($response->toolResults[0]->result)->toBe('Deleted users');
    });

    it('marks the paused message completed once the resume has finished', function () {
        FakeAnthropic::script([FakeAnthropic::text('Deleted them')]);

        ($this->resumer)()->prompt(Decisions::from(['toolu_1' => true]));

        expect(approvalStatuses())
            ->toBe(['user' => 'completed', 'assistant' => 'completed']);
    });

    it('runs an approved tool with the edited arguments', function () {
        FakeAnthropic::script([FakeAnthropic::text('Deleted them')]);

        ($this->resumer)()->prompt(Decisions::from(['toolu_1' => Decision::edit(['table' => 'orders'])]));

        $resolved = $this->sdk->sole(ToolApprovalResolved::class)->event;

        expect($this->handled)->toBe([['table' => 'orders']])
            ->and($this->sdk->sole(InvokingTool::class)->event->arguments)->toBe(['table' => 'orders'])
            ->and($resolved->toolResults[0]->arguments)->toBe(['table' => 'orders'])
            ->and($resolved->toolResults[0]->result)->toBe('Deleted orders');
    });

    it('does not run a rejected tool and tells the model why', function () {
        $anthropic = FakeAnthropic::script([FakeAnthropic::text('Understood')]);

        $response = ($this->resumer)()->prompt(Decisions::from(['toolu_1' => Decision::reject('Not allowed')]));

        $resolved = $this->sdk->sole(ToolApprovalResolved::class)->event;

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'AgentPrompted',
            'ToolApprovalResolved',
        ])->and($this->handled)->toBe([])
            ->and($response->text)->toBe('Understood')
            ->and($resolved->toolResults[0]->result)->toBe('Not allowed')
            ->and($resolved->toolResults[0]->denied)->toBeTrue()
            ->and($resolved->toolResults[0]->failed)->toBeFalse()
            ->and($anthropic->requests())->toHaveCount(1);
    });

    it('ends the run without any step when a rejection carries no result', function () {
        $anthropic = FakeAnthropic::script([FakeAnthropic::text('Never asked')]);

        $response = ($this->resumer)()->prompt(Decisions::from(['toolu_1' => false]));

        $resolved = $this->sdk->sole(ToolApprovalResolved::class)->event;

        // A bare rejection is a stop signal: the model is not called, so there is no step, no usage and no text...
        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'AgentPrompted',
            'ToolApprovalResolved',
        ])->and($response->text)->toBe('')
            ->and($response->steps)->toHaveCount(0)
            ->and($response->usage->inputTokens)->toBe(0)
            ->and($response->usage->outputTokens)->toBe(0)
            ->and($anthropic->requests())->toHaveCount(0)
            ->and($anthropic->remaining())->toBe(1)
            ->and($resolved->toolResults[0]->result)->toBe('The user rejected this tool call.')
            ->and($resolved->toolResults[0]->denied)->toBeTrue();
    });

    it('ends the run without any step for a blank rejection result as well', function () {
        FakeAnthropic::script([FakeAnthropic::text('Never asked')]);

        ($this->resumer)()->prompt(Decisions::from(['toolu_1' => Decision::reject('')]));

        expect($this->sdk->timeline())->toBe(['PromptingAgent', 'AgentPrompted', 'ToolApprovalResolved']);
    });

    it('records a throwing approved tool as a failed result and carries on', function () {
        FakeAnthropic::script([FakeAnthropic::text('It failed')]);

        $agent = approvalAgent([new ApprovalTool(handler: fn () => throw new RuntimeException('Disk full'))], $this->user, $this->paused->conversationId);
        $response = $agent->prompt(Decisions::from(['toolu_1' => true]));

        $resolved = $this->sdk->sole(ToolApprovalResolved::class)->event;
        $failed = $this->sdk->sole(ToolFailed::class)->event;

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'InvokingTool(delete_records)',
            'ToolFailed(delete_records)',
            'StartingStep#0',
            'StepCompleted#0',
            'AgentPrompted',
            'ToolApprovalResolved',
        ])->and($response->text)->toBe('It failed')
            ->and($failed->exception->getMessage())->toBe('Disk full')
            ->and($resolved->toolResults[0]->result)->toBe('The tool call failed: Disk full')
            ->and($resolved->toolResults[0]->failed)->toBeTrue()
            ->and($resolved->toolResults[0]->denied)->toBeFalse();
    });

    it('never fires ToolApprovalResolved when the step after the approved tool fails', function () {
        FakeAnthropic::script([FakeAnthropic::error(500, 'Provider down')]);

        $thrown = null;

        try {
            ($this->resumer)()->prompt(Decisions::from(['toolu_1' => true]));
        } catch (Throwable $exception) {
            $thrown = $exception;
        }

        // The tool already ran and its result is stored, but nothing announces it...
        expect($thrown)->not->toBeNull()
            ->and($this->sdk->timeline())->toBe([
                'PromptingAgent',
                'InvokingTool(delete_records)',
                'ToolInvoked(delete_records)',
                'StartingStep#0',
                'StepFailed#0',
                'AgentFailed',
            ])->and($this->sdk->of(ToolApprovalResolved::class))->toBe([])
            ->and($this->handled)->toBe([['table' => 'users']])
            ->and($this->sdk->of(ToolInvoked::class)[0]->event->result)->toBe('Deleted users')
            ->and(approvalStatuses())
            ->toBe(['user' => 'completed', 'assistant' => 'failed']);
    });

    it('rejects every call without a decision of its own when a wildcard rejects the rest', function () {
        FakeAnthropic::script([FakeAnthropic::text('Understood')]);

        ($this->resumer)()->prompt(Decision::rejectAll('Not today'));

        $resolved = $this->sdk->sole(ToolApprovalResolved::class)->event;

        expect($this->handled)->toBe([])
            ->and($resolved->toolResults->pluck('result')->all())->toBe(['Not today']);
    });

    it('streams a resume as StreamingAgent, tool events, then AgentStreamed and ToolApprovalResolved', function () {
        FakeAnthropic::script([FakeAnthropic::text('Deleted them')]);

        $stream = ($this->resumer)()->stream(Decisions::from(['toolu_1' => true]));

        foreach ($stream as $event) {
            // Consuming the stream is what runs the agent...
        }

        expect($this->sdk->timeline())->toBe([
            'StreamingAgent',
            'InvokingTool(delete_records)',
            'ToolInvoked(delete_records)',
            'StartingStep#0',
            'StepCompleted#0',
            'AgentStreamed',
            'ToolApprovalResolved',
        ]);
    });
});

describe('linking a pause to its resume', function () {
    beforeEach(function () {
        $this->migrateSdkTables();

        $this->user = new ConversationParticipant;

        FakeAnthropic::script([approvalToolTurn('toolu_77'), FakeAnthropic::text('Deleted them')]);

        $this->pausedAgent = approvalAgent([new ApprovalTool], $this->user);
        $this->paused = $this->pausedAgent->prompt('Delete the users');
        $this->pausedEvents = $this->sdk->all();

        $this->sdk->clear();

        $this->resumedAgent = approvalAgent([new ApprovalTool], $this->user, $this->paused->conversationId);
        $this->resumed = $this->resumedAgent->prompt(Decisions::from(['toolu_77' => true]));
    });

    it('shares the pending approval id, the tool call id and the resolved tool result id', function () {
        $requested = array_values(array_filter($this->pausedEvents, fn ($entry) => $entry->is(ToolApprovalRequested::class)))[0]->event;
        $resolved = $this->sdk->sole(ToolApprovalResolved::class)->event;

        expect($requested->pendingApprovals[0]->id)->toBe('toolu_77')
            ->and($this->paused->toolCalls[0]->id)->toBe('toolu_77')
            ->and($resolved->toolResults[0]->id)->toBe('toolu_77')
            ->and($this->sdk->sole(InvokingTool::class)->event->toolInvocationId)->not->toBe('toolu_77');
    });

    it('shares the conversation id between the paused run and the resumed run', function () {
        $requested = array_values(array_filter($this->pausedEvents, fn ($entry) => $entry->is(ToolApprovalRequested::class)))[0];
        $resolved = $this->sdk->sole(ToolApprovalResolved::class);

        expect($requested->responseConversationId)->toHaveLength(36)
            ->and($resolved->responseConversationId)->toBe($requested->responseConversationId)
            ->and($this->resumed->conversationId)->toBe($this->paused->conversationId)
            // The resumed run sees the conversation from its first event, since the caller continued it...
            ->and($this->sdk->sole(PromptingAgent::class)->agentConversationId)->toBe($this->paused->conversationId);
    });

    it('gives the two runs different invocation ids and no other reference to each other', function () {
        $first = $this->paused->invocationId;
        $second = $this->resumed->invocationId;

        expect($second)->not->toBe($first)
            ->and(array_unique(array_map(fn ($entry) => $entry->invocationId, $this->pausedEvents)))->toBe([$first])
            ->and($this->sdk->invocationIds())->toBe([$second]);

        $prompt = $this->sdk->sole(PromptingAgent::class)->event->prompt;

        expect($prompt->parentInvocationId)->toBeNull()
            ->and($prompt->parentToolInvocationId)->toBeNull()
            ->and($this->sdk->sole(PromptingAgent::class)->parentInvocation)->toBe([null, null])
            ->and(array_keys(get_object_vars($this->sdk->sole(ToolApprovalResolved::class)->event)))
            ->toBe(['invocationId', 'agent', 'toolResults', 'conversationId', 'conversationUser']);
    });

    it('uses a different agent instance for the resume when the app builds a fresh one', function () {
        expect($this->sdk->sole(ToolApprovalResolved::class)->event->agent)->toBe($this->resumedAgent)
            ->and($this->resumedAgent)->not->toBe($this->pausedAgent);
    });
});
