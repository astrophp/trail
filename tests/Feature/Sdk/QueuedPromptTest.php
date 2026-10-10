<?php

use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Agents\RememberingAgent;
use Astro\Trail\Tests\Fixtures\Conversations\ConversationParticipant;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Tools\LookupTool;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Queue;
use Laravel\Ai\Events\AgentFailed;
use Laravel\Ai\Events\AgentPrompted;
use Laravel\Ai\Events\PromptingAgent;
use Laravel\Ai\Jobs\InvokeAgent;
use Laravel\Ai\Models\Conversation;
use Laravel\Ai\Responses\QueuedAgentResponse;

/*
|--------------------------------------------------------------------------
| ->queue(): the prompt runs later, in a worker
|--------------------------------------------------------------------------
|
| ->queue() only dispatches an InvokeAgent job. The run, its events and its
| invocation id belong to the worker that handles the job. Tests either let
| the sync queue run the job straight away (which serializes the agent, as
| a real queue would) or fake the queue and call the pushed job's handle()
| themselves, the way a worker does.
|
*/

describe('dispatching', function () {
    beforeEach(function () {
        Queue::fake();
    });

    it('returns a queued response that exposes the job but no invocation id', function () {
        $queued = (new AssistantAgent)->queue('Hi');

        $job = $queued->getJob();

        expect($queued)->toBeInstanceOf(QueuedAgentResponse::class)
            ->and($job)->toBeInstanceOf(InvokeAgent::class)
            ->and($job->prompt)->toBe('Hi')
            ->and(array_keys(get_object_vars($job)))->not->toContain('invocationId')
            ->and(property_exists($queued, 'invocationId'))->toBeFalse()
            ->and($job->job)->toBeNull();
    });

    it('fires no SDK event at dispatch time', function () {
        $queued = (new AssistantAgent)->queue('Hi');

        unset($queued);

        Queue::assertPushed(InvokeAgent::class, 1);

        expect($this->sdk->all())->toBe([]);
    });

    it('fires every event when the pushed job is handled, with an invocation id generated there', function () {
        FakeAnthropic::script([FakeAnthropic::text('Hello')]);

        $queued = (new AssistantAgent)->queue('Hi');

        unset($queued);

        Queue::pushed(InvokeAgent::class)->first()->handle();

        $prompted = $this->sdk->sole(AgentPrompted::class)->event;

        expect($this->sdk->timeline())->toBe(['PromptingAgent', 'StartingStep#0', 'StepCompleted#0', 'AgentPrompted'])
            ->and($this->sdk->invocationIds())->toBe([$prompted->response->invocationId])
            ->and($this->sdk->sole(PromptingAgent::class)->event->prompt->prompt)->toBe('Hi')
            ->and($this->sdk->sole(PromptingAgent::class)->parentInvocation)->toBe([null, null]);
    });

    it('gives a new invocation id each time the same job is handled', function () {
        FakeAnthropic::script([FakeAnthropic::text('One'), FakeAnthropic::text('Two')]);

        $queued = (new AssistantAgent)->queue('Hi');

        unset($queued);

        $job = Queue::pushed(InvokeAgent::class)->first();

        $job->handle();
        $job->handle();

        $ids = $this->sdk->invocationIds();

        expect($this->sdk->names())->toBe([
            'PromptingAgent', 'StartingStep', 'StepCompleted', 'AgentPrompted',
            'PromptingAgent', 'StartingStep', 'StepCompleted', 'AgentPrompted',
        ])->and($ids)->toHaveCount(2)
            ->and($ids[1])->not->toBe($ids[0]);
    });

    it('records a failing job run as a failed invocation of its own', function () {
        FakeAnthropic::script([FakeAnthropic::error(500, 'Provider down')]);

        $queued = (new AssistantAgent)->queue('Hi');

        unset($queued);

        $job = Queue::pushed(InvokeAgent::class)->first();

        expect(fn () => $job->handle())->toThrow(RequestException::class);

        expect($this->sdk->timeline())->toBe(['PromptingAgent', 'StartingStep#0', 'StepFailed#0', 'AgentFailed'])
            ->and($this->sdk->sole(AgentFailed::class)->event->exception)->toBeInstanceOf(RequestException::class)
            ->and($this->sdk->invocationIds())->toHaveCount(1);
    });
});

describe('with the sync queue', function () {
    it('runs the job as soon as the dispatch finishes, in the same process', function () {
        FakeAnthropic::script([FakeAnthropic::text('Hello')]);

        $queued = (new AssistantAgent)->queue('Hi');

        // The dispatch only happens when the pending dispatch is released...
        expect(config('queue.default'))->toBe('sync')
            ->and($this->sdk->all())->toBe([]);

        unset($queued);

        expect($this->sdk->timeline())->toBe(['PromptingAgent', 'StartingStep#0', 'StepCompleted#0', 'AgentPrompted']);
    });

    it('hands the response to the then callback with the invocation id of the worker run', function () {
        FakeAnthropic::script([FakeAnthropic::text('Hello')]);

        (new AssistantAgent)->queue('Hi')->then(function ($response) {
            config(['queued.text' => $response->text, 'queued.invocation' => $response->invocationId]);
        });

        expect(config('queued.text'))->toBe('Hello')
            ->and(config('queued.invocation'))->toBe($this->sdk->sole(AgentPrompted::class)->event->response->invocationId)
            ->and(config('queued.invocation'))->toBe($this->sdk->invocationIds()[0]);
    });

    it('calls the catch callback and still throws when the run fails', function () {
        FakeAnthropic::script([FakeAnthropic::error(500, 'Provider down')]);

        expect(function () {
            (new AssistantAgent)->queue('Hi')->catch(function ($exception) {
                config(['queued.caught' => $exception::class]);
            });
        })->toThrow(RequestException::class);

        expect(config('queued.caught'))->toBe(RequestException::class)
            ->and($this->sdk->timeline())->toBe(['PromptingAgent', 'StartingStep#0', 'StepFailed#0', 'AgentFailed']);
    });

    it('runs the agent as a serialized copy, so the caller never sees the conversation id', function () {
        $this->migrateSdkTables();

        $user = new ConversationParticipant;

        FakeAnthropic::script([FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'x']]]), FakeAnthropic::text('Done')]);

        $agent = (new RememberingAgent([new LookupTool]))->forUser($user);

        $agent->queue('Hi');

        $prompted = $this->sdk->sole(AgentPrompted::class);

        expect($this->sdk->sole(PromptingAgent::class)->event->prompt->agent)->not->toBe($agent)
            ->and($this->sdk->sole(PromptingAgent::class)->agentConversationId)->toBeNull()
            ->and($prompted->responseConversationId)->toHaveLength(36)
            ->and(Conversation::query()->pluck('id')->all())->toBe([$prompted->responseConversationId])
            ->and($agent->currentConversation())->toBeNull();
    });
});
