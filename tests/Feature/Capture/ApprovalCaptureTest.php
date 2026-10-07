<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Capture\Approvals;
use Astro\Trail\Tests\Fixtures\Capture\Captured;
use Astro\Trail\Tests\Fixtures\Capture\Streams;
use Astro\Trail\Tests\Fixtures\Conversations\ConversationParticipant;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Tools\ApprovalTool;
use Astro\Trail\Tests\Fixtures\Tools\LookupTool;
use Illuminate\Support\Facades\Event;
use Laravel\Ai\Approvals\Decision;
use Laravel\Ai\Approvals\Decisions;
use Laravel\Ai\Events\StartingStep;
use Laravel\Ai\Exceptions\ApprovalNotResumableException;
use Laravel\Ai\Responses\AgentResponse;

/*
|--------------------------------------------------------------------------
| How approval pauses and their resumes are stored
|--------------------------------------------------------------------------
|
| A paused run ends with its normal terminal event, so it is a trace of its own
| that waits for approval. The run that resumes it is another trace. The only
| link between them is the tool call id.
|
*/

beforeEach(function () {
    $this->user = new ConversationParticipant;

    /** The trace row of a run, after a flush. */
    $this->read = function (string $id): Captured {
        Trail::flush();

        return Captured::read($id);
    };

    /** Pause a run on the gated tool and return its response. */
    $this->pause = function (?array $tools = null, ?string $reason = 'Deletes data'): AgentResponse {
        FakeAnthropic::script([Approvals::turn()]);

        return Approvals::agent($tools ?? [(new ApprovalTool)->requireApproval($reason)], $this->user)->prompt('Delete the users', model: FakeAnthropic::MODEL);
    };

    /** The agent that resumes the paused conversation. */
    $this->resumer = fn (AgentResponse $paused, ?Closure $handler = null) => Approvals::agent([new ApprovalTool(handler: $handler)], $this->user, $paused->conversationId);
});

describe('a run that pauses', function () {
    it('is awaiting approval and lists what it waits for', function () {
        $paused = ($this->pause)();
        $run = ($this->read)($paused->invocationId)->assertVolatileColumns();

        expect($run->rawTrace()['status'])->toBe('awaiting_approval')
            ->and($run->rawTrace()['metadata'])->toBe(['pending_approvals' => [
                ['tool_call_id' => 'toolu_1', 'tool' => 'delete_records', 'arguments' => ['table' => 'users'], 'reason' => 'Deletes data'],
            ]])
            ->and(array_column($run->rawSpans(), 'type'))->toBe(['agent', 'step'])
            ->and(array_column($run->rawSpans(), 'status'))->toBe(['awaiting_approval', 'completed'])
            ->and($run->rawSpans()[0]['metadata'])->toBeNull();
    });

    it('records the ordinary tool of the same step and lists only the gated one as pending', function () {
        FakeAnthropic::script([FakeAnthropic::toolUse([
            ['id' => 'toolu_1', 'name' => 'delete_records', 'input' => ['table' => 'users']],
            ['id' => 'toolu_2', 'name' => 'lookup', 'input' => ['query' => 'laravel']],
        ])]);

        $paused = Approvals::agent([new ApprovalTool, new LookupTool], $this->user)->prompt('Do both', model: FakeAnthropic::MODEL);
        $run = ($this->read)($paused->invocationId);

        expect(Captured::pick($run->spans(), ['type', 'name', 'status']))->toBe([
            ['type' => 'agent', 'name' => 'RememberingAgent', 'status' => 'awaiting_approval'],
            ['type' => 'step', 'name' => 'step', 'status' => 'completed'],
            ['type' => 'tool', 'name' => 'lookup', 'status' => 'completed'],
        ])->and(array_column($run->rawTrace()['metadata']['pending_approvals'], 'tool_call_id'))->toBe(['toolu_1']);
    });

    it('fails when the agent cannot be resumed, with its step completed', function () {
        FakeAnthropic::script([Approvals::turn()]);

        $caught = null;

        try {
            (new AssistantAgent([new ApprovalTool]))->prompt('Delete the users');
        } catch (ApprovalNotResumableException $exception) {
            $caught = $exception;
        }

        $run = ($this->read)($this->sdk->invocationIds()[0]);

        expect($caught)->toBeInstanceOf(ApprovalNotResumableException::class)
            ->and(Captured::pick([$run->trace()], ['status', 'issue_kind', 'error_class', 'error_source', 'metadata'])[0])->toBe([
                'status' => 'failed', 'issue_kind' => 'exception', 'error_class' => ApprovalNotResumableException::class, 'error_source' => 'run', 'metadata' => null,
            ])->and(Captured::pick($run->spans(), ['type', 'status']))->toBe([
                ['type' => 'agent', 'status' => 'failed'],
                ['type' => 'step', 'status' => 'completed'],
            ]);
    });

    it('is recorded the same way when the run is streamed', function () {
        FakeAnthropic::script([Approvals::turn()]);

        $stream = Approvals::agent([(new ApprovalTool)->requireApproval('Deletes data')], $this->user)->stream('Delete the users', model: FakeAnthropic::MODEL);
        Streams::drain($stream);
        $run = ($this->read)($stream->invocationId);

        expect($run->rawTrace()['status'])->toBe('awaiting_approval')
            ->and($run->rawTrace()['streamed'])->toBeTrue()
            ->and($run->rawTrace()['metadata']['pending_approvals'][0]['tool_call_id'])->toBe('toolu_1')
            ->and(array_column($run->rawSpans(), 'status'))->toBe(['awaiting_approval', 'completed']);
    });
});

describe('a run that resumes', function () {
    beforeEach(function () {
        $this->paused = ($this->pause)();
        Trail::flush();
        $this->sdk->clear();
    });

    it('is a separate trace whose approved tool runs before its first step', function () {
        FakeAnthropic::script([FakeAnthropic::text('Deleted them')]);

        $resumed = ($this->resumer)($this->paused)->prompt(Decisions::from(['toolu_1' => true]), model: FakeAnthropic::MODEL);
        $run = ($this->read)($resumed->invocationId)->assertVolatileColumns();

        expect($resumed->invocationId)->not->toBe($this->paused->invocationId)
            ->and($run->rawTrace()['status'])->toBe('completed')
            ->and($run->rawTrace()['metadata'])->toBe(['resolved_tool_call_ids' => ['toolu_1']])
            ->and(Captured::pick($run->spans(), ['type', 'name', 'sequence', 'status']))->toBe([
                ['type' => 'agent', 'name' => 'RememberingAgent', 'sequence' => 1, 'status' => 'completed'],
                ['type' => 'tool', 'name' => 'delete_records', 'sequence' => 2, 'status' => 'completed'],
                ['type' => 'step', 'name' => 'step', 'sequence' => 3, 'status' => 'completed'],
            ])->and($run->rawSpans()[1]['parent_id'])->toBe($resumed->invocationId)
            ->and($run->rawSpans()[1]['output'])->toBe(['result' => 'Deleted users']);

        // The paused trace was written by its own request and is left exactly as it was.
        $before = Captured::read($this->paused->invocationId);

        expect($before->rawTrace()['status'])->toBe('awaiting_approval')
            ->and(array_keys($before->rawTrace()['metadata']))->toBe(['pending_approvals']);
    });

    it('records a rejection with a result as a run with one step and no tool', function () {
        FakeAnthropic::script([FakeAnthropic::text('Understood')]);

        $resumed = ($this->resumer)($this->paused)->prompt(Decisions::from(['toolu_1' => Decision::reject('Not allowed')]), model: FakeAnthropic::MODEL);
        $run = ($this->read)($resumed->invocationId);

        expect($run->rawTrace()['status'])->toBe('completed')
            ->and(array_column($run->rawSpans(), 'type'))->toBe(['agent', 'step'])
            ->and($run->rawTrace()['metadata'])->toBe(['resolved_tool_call_ids' => ['toolu_1']]);
    });

    it('records a bare rejection as a run with no step, and no usage rather than zero', function () {
        FakeAnthropic::script([FakeAnthropic::text('Never asked')]);

        $resumed = ($this->resumer)($this->paused)->prompt(Decisions::from(['toolu_1' => false]), model: FakeAnthropic::MODEL);
        $run = ($this->read)($resumed->invocationId);

        expect(Captured::pick([$run->trace()], ['status', 'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'reasoning_tokens', 'cost', 'span_count', 'unpriced_span_count'])[0])->toBe([
            'status' => 'completed', 'input_tokens' => null, 'output_tokens' => null, 'cache_read_tokens' => null, 'cache_write_tokens' => null, 'reasoning_tokens' => null, 'cost' => null, 'span_count' => 1, 'unpriced_span_count' => 0,
        ])->and($run->rawTrace()['metadata'])->toBe(['resolved_tool_call_ids' => ['toolu_1']]);
    });

    it('carries on, completed, when the approved tool throws', function () {
        FakeAnthropic::script([FakeAnthropic::text('It failed')]);

        $resumed = ($this->resumer)($this->paused, fn () => throw new RuntimeException('Disk full'))->prompt(Decisions::from(['toolu_1' => true]), model: FakeAnthropic::MODEL);
        $run = ($this->read)($resumed->invocationId)->assertVolatileColumns();

        expect(Captured::pick([$run->trace()], ['status', 'issue_kind', 'error_class', 'error_message', 'error_source'])[0])->toBe([
            'status' => 'completed', 'issue_kind' => null, 'error_class' => null, 'error_message' => null, 'error_source' => null,
        ])->and(Captured::pick($run->spans(), ['type', 'status', 'issue_kind', 'error_class', 'error_message', 'error_source']))->toBe([
            ['type' => 'agent', 'status' => 'completed', 'issue_kind' => null, 'error_class' => null, 'error_message' => null, 'error_source' => null],
            ['type' => 'tool', 'status' => 'failed', 'issue_kind' => 'tool_error', 'error_class' => RuntimeException::class, 'error_message' => 'Disk full', 'error_source' => 'tool'],
            ['type' => 'step', 'status' => 'completed', 'issue_kind' => null, 'error_class' => null, 'error_message' => null, 'error_source' => null],
        ]);
    });

    it('does not end the run when the approved tool throws, which only the run\'s own terminal event does', function () {
        FakeAnthropic::script([FakeAnthropic::text('It failed')]);

        // Flushed as the first step starts, after the tool failed and before the run can end.
        Event::listen(StartingStep::class, fn () => Trail::flush());

        $resumed = ($this->resumer)($this->paused, fn () => throw new RuntimeException('Disk full'))->prompt(Decisions::from(['toolu_1' => true]), model: FakeAnthropic::MODEL);
        $run = Captured::read($resumed->invocationId);

        expect($resumed->text)->toBe('It failed')
            ->and(Captured::pick([$run->trace()], ['status', 'issue_kind', 'error_class'])[0])->toBe(['status' => 'running', 'issue_kind' => null, 'error_class' => null])
            ->and(Captured::pick($run->spans(), ['type', 'status']))->toBe([['type' => 'agent', 'status' => 'running'], ['type' => 'tool', 'status' => 'failed'], ['type' => 'step', 'status' => 'running']]);
    });

    it('keeps the resolved ids and the finished tool when the resumed run then fails', function () {
        FakeAnthropic::script([FakeAnthropic::error(500, 'Provider down')]);

        try {
            ($this->resumer)($this->paused)->prompt(Decisions::from(['toolu_1' => true]), model: FakeAnthropic::MODEL);
        } catch (Throwable) {
            // The run failed after the approved tool had already run.
        }

        $run = ($this->read)($this->sdk->invocationIds()[0]);

        expect($run->rawTrace()['status'])->toBe('failed')
            ->and($run->rawTrace()['metadata'])->toBe(['resolved_tool_call_ids' => ['toolu_1']])
            ->and(Captured::pick($run->spans(), ['type', 'status']))->toBe([
                ['type' => 'agent', 'status' => 'failed'],
                ['type' => 'tool', 'status' => 'completed'],
                ['type' => 'step', 'status' => 'failed'],
            ]);
    });

    it('never stores the wildcard as a tool call id', function (Closure $decisions, array $expected) {
        FakeAnthropic::script([FakeAnthropic::text('Done')]);

        $resumed = ($this->resumer)($this->paused)->prompt($decisions(), model: FakeAnthropic::MODEL);
        $run = ($this->read)($resumed->invocationId);

        expect($run->rawTrace()['metadata']['resolved_tool_call_ids'])->toBe($expected);
    })->with([
        'approve everything' => [fn () => Decision::approveAll(), ['toolu_1']],
        'reject everything with a result' => [fn () => Decision::rejectAll('Not today'), ['toolu_1']],
        'a named call and the rest' => [fn () => Decisions::from(['toolu_1' => true])->rejectRemaining('x'), ['toolu_1']],
    ]);

    it('has only the named ids when a wildcard run fails before the response can say what it settled', function () {
        FakeAnthropic::script([FakeAnthropic::error(500, 'Provider down')]);

        try {
            ($this->resumer)($this->paused)->prompt(Decision::approveAll(), model: FakeAnthropic::MODEL);
        } catch (Throwable) {
            // Failed.
        }

        $run = ($this->read)($this->sdk->invocationIds()[0]);

        expect($run->rawTrace()['metadata'])->toBe(['resolved_tool_call_ids' => []]);
    });

    it('is recorded the same way when the resume is streamed', function () {
        FakeAnthropic::script([FakeAnthropic::text('Deleted them')]);

        $stream = ($this->resumer)($this->paused)->stream(Decisions::from(['toolu_1' => true]), model: FakeAnthropic::MODEL);
        Streams::drain($stream);
        $run = ($this->read)($stream->invocationId);

        expect($run->rawTrace()['status'])->toBe('completed')
            ->and($run->rawTrace()['streamed'])->toBeTrue()
            ->and($run->rawTrace()['metadata'])->toBe(['resolved_tool_call_ids' => ['toolu_1']])
            ->and(array_column($run->rawSpans(), 'type'))->toBe(['agent', 'tool', 'step']);
    });
});
