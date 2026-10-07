<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Agents\ResearcherAgent;
use Astro\Trail\Tests\Fixtures\Agents\SummarizerAgent;
use Astro\Trail\Tests\Fixtures\Capture\Captured;
use Astro\Trail\Tests\Fixtures\Capture\Failures;
use Astro\Trail\Tests\Fixtures\Capture\Streams;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Storage\DatabaseStoreProbe;
use Astro\Trail\Tests\Fixtures\Tools\CallbackTool;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Laravel\Ai\Embeddings;
use Laravel\Ai\Events\AgentFailed;
use Laravel\Ai\Events\AgentPrompted;
use Laravel\Ai\Events\InvokingTool;
use Laravel\Ai\Events\PromptingAgent;
use Laravel\Ai\Events\StartingStep;
use Laravel\Ai\Events\StepCompleted;
use Laravel\Ai\Prompts\AgentPrompt;

/*
|--------------------------------------------------------------------------
| How sub-agents are stored
|--------------------------------------------------------------------------
|
| A sub-agent's run joins the trace of the run that delegated to it: its agent
| span hangs under the tool call that started it, and its steps number on in the
| trace's own sequence. Only the root run decides the trace's status.
|
*/

beforeEach(function () {
    $this->inserts = 0;
    DB::listen(function ($query) {
        if (preg_match('/^insert into ["`]?trail_traces/i', $query->sql) === 1) {
            $this->inserts++;
        }
    });

    $this->stored = function (): Captured {
        Trail::flush();

        return Captured::read($this->sdk->invocationIds()[0]);
    };

    /** The invocation and tool invocation ids of the run, labelled for reading a tree. */
    $this->labels = function (): array {
        $labels = [];

        foreach ($this->sdk->invocationIds() as $position => $id) {
            $labels[$id] = ['parent', 'child', 'grandchild'][$position];
        }

        foreach ($this->sdk->of(InvokingTool::class) as $position => $entry) {
            $labels[$entry->event->toolInvocationId] = 'tool'.($position + 1);
        }

        return $labels;
    };

    $this->delegating = fn (string $name = 'ResearcherAgent', array $usage = []) => FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => $name, 'input' => ['task' => 'Dig', 'query' => 'x']]], usage: $usage);
});

/** The tree of one level of delegation, as the parent, its tool, the child and their steps. */
function oneLevelTree(string $toolName): array
{
    return [
        ['agent', 'AssistantAgent', null, 1, 1, 'completed'],
        ['step', 'step', 'parent', 1, 2, 'completed'],
        ['tool', $toolName, 'parent', 1, 3, 'completed'],
        ['agent', 'ResearcherAgent', 'tool1', 1, 4, 'completed'],
        ['step', 'step', 'child', 1, 5, 'completed'],
        ['step', 'step', 'parent', 1, 6, 'completed'],
    ];
}

describe('one level of delegation', function () {
    beforeEach(function () {
        config(['trail.pricing.anthropic' => [
            FakeAnthropic::MODEL => ['input' => 3.0, 'output' => 15.0],
            'claude-sonnet-5-5' => ['input' => 4.0, 'output' => 20.0],
        ]]);
    });

    it('records an agent used as a tool as one trace, with the child under the tool call', function () {
        FakeAnthropic::script([
            ($this->delegating)('ResearcherAgent', ['input_tokens' => 100, 'output_tokens' => 20]),
            FakeAnthropic::text('found it', usage: ['input_tokens' => 10, 'output_tokens' => 5]),
            FakeAnthropic::text('Done', usage: ['input_tokens' => 7, 'output_tokens' => 3]),
        ]);

        $response = (new AssistantAgent([new ResearcherAgent]))->prompt('Hi', model: FakeAnthropic::MODEL);
        $run = ($this->stored)()->assertVolatileColumns();

        $toolId = $this->sdk->sole(InvokingTool::class)->event->toolInvocationId;
        $childId = $this->sdk->invocationIds()[1];

        // Parent step 0: 100 x 3 + 20 x 15. Child: 10 x 4 + 5 x 20. Parent step 1: 7 x 3 + 3 x 15 (per million tokens).
        expect((new DatabaseStoreProbe)->traceCount())->toBe(1)
            ->and($run->rawTrace()['id'])->toBe($response->invocationId)
            ->and($this->inserts)->toBe(1)
            ->and($run->outline(($this->labels)()))->toBe(oneLevelTree('ResearcherAgent'))
            ->and($run->spanId(3))->toBe($childId)
            ->and($run->rawSpans()[3]['parent_id'])->toBe($toolId)
            ->and(array_column($run->rawSpans(), 'agent_class'))->toBe([AssistantAgent::class, null, null, ResearcherAgent::class, null, null])
            ->and(Captured::pick([$run->trace()], ['status', 'child_failed', 'streamed', 'input_tokens', 'output_tokens', 'cost', 'span_count', 'unpriced_span_count'])[0])
            ->toBe(['status' => 'completed', 'child_failed' => false, 'streamed' => false, 'input_tokens' => 117, 'output_tokens' => 28, 'cost' => '0.0008060000', 'span_count' => 6, 'unpriced_span_count' => 0]);
    });

    it('records an agent prompted by hand inside an ordinary tool the same way', function () {
        FakeAnthropic::script([
            ($this->delegating)('ask', ['input_tokens' => 100, 'output_tokens' => 20]),
            FakeAnthropic::text('found it', usage: ['input_tokens' => 10, 'output_tokens' => 5]),
            FakeAnthropic::text('Done', usage: ['input_tokens' => 7, 'output_tokens' => 3]),
        ]);

        $ask = new CallbackTool('ask', fn () => (new ResearcherAgent)->prompt('Dig')->text);

        (new AssistantAgent([$ask]))->prompt('Hi', model: FakeAnthropic::MODEL);
        $run = ($this->stored)()->assertVolatileColumns();

        expect($run->outline(($this->labels)()))->toBe(oneLevelTree('ask'))
            ->and($run->trace()['cost'])->toBe('0.0008060000')
            ->and($this->inserts)->toBe(1);
    });
});

describe('two levels', function () {
    $twoLevels = [
        ['agent', 'AssistantAgent', null, 1, 1, 'completed'],
        ['step', 'step', 'parent', 1, 2, 'completed'],
        ['tool', 'ResearcherAgent', 'parent', 1, 3, 'completed'],
        ['agent', 'ResearcherAgent', 'tool1', 1, 4, 'completed'],
        ['step', 'step', 'child', 1, 5, 'completed'],
        ['tool', 'NESTED', 'child', 1, 6, 'completed'],
        ['agent', 'SummarizerAgent', 'tool2', 1, 7, 'completed'],
        ['step', 'step', 'grandchild', 1, 8, 'completed'],
        ['step', 'step', 'child', 1, 9, 'completed'],
        ['step', 'step', 'parent', 1, 10, 'completed'],
    ];

    it('hangs a hand-prompted grandchild under the child\'s tool call', function () use ($twoLevels) {
        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'ResearcherAgent', 'input' => ['task' => 'Dig']]]),
            FakeAnthropic::toolUse([['id' => 'toolu_2', 'name' => 'ask', 'input' => ['query' => 'x']]]),
            FakeAnthropic::text('summary'),
            FakeAnthropic::text('found it'),
            FakeAnthropic::text('Done'),
        ]);

        $ask = new CallbackTool('ask', fn () => (new SummarizerAgent)->prompt('Summarise')->text);

        (new AssistantAgent([new ResearcherAgent([$ask])]))->prompt('Hi');
        $run = ($this->stored)()->assertVolatileColumns();

        $expected = array_map(fn (array $row) => $row[1] === 'NESTED' ? [$row[0], 'ask', ...array_slice($row, 2)] : $row, $twoLevels);

        expect($run->outline(($this->labels)()))->toBe($expected)
            ->and($run->trace()['span_count'])->toBe(10)
            ->and($this->inserts)->toBe(1);
    });

    it('hangs the grandchild under the child\'s tool call when both levels are delegated as tools', function () use ($twoLevels) {
        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'ResearcherAgent', 'input' => ['task' => 'Dig']]]),
            FakeAnthropic::toolUse([['id' => 'toolu_2', 'name' => 'SummarizerAgent', 'input' => ['task' => 'Condense']]]),
            FakeAnthropic::text('summary'),
            FakeAnthropic::text('found it'),
            FakeAnthropic::text('Done'),
        ]);

        (new AssistantAgent([new ResearcherAgent([new SummarizerAgent])]))->prompt('Hi');
        $run = ($this->stored)()->assertVolatileColumns();

        $expected = array_map(fn (array $row) => $row[1] === 'NESTED' ? [$row[0], 'SummarizerAgent', ...array_slice($row, 2)] : $row, $twoLevels);

        expect($run->outline(($this->labels)()))->toBe($expected);
    });
});

describe('a streamed parent', function () {
    it('records the same tree for one level, with the streamed child\'s steps having no responding model', function () {
        FakeAnthropic::script([
            ($this->delegating)('ResearcherAgent'),
            FakeAnthropic::text('found it', model: 'claude-test-responding'),
            FakeAnthropic::text('Done'),
        ]);

        Streams::drain((new AssistantAgent([new ResearcherAgent]))->stream('Hi', model: FakeAnthropic::MODEL));
        $run = ($this->stored)()->assertVolatileColumns();

        expect($run->outline(($this->labels)()))->toBe(oneLevelTree('ResearcherAgent'))
            ->and($run->trace()['streamed'])->toBeTrue()
            ->and(array_column($run->rawSpans(), 'responding_model'))->toBe([null, null, null, null, null, null])
            ->and($this->inserts)->toBe(1);
    });

    it('records the same tree for two levels', function () {
        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'ResearcherAgent', 'input' => ['task' => 'Dig']]]),
            FakeAnthropic::toolUse([['id' => 'toolu_2', 'name' => 'SummarizerAgent', 'input' => ['task' => 'Condense']]]),
            FakeAnthropic::text('summary'),
            FakeAnthropic::text('found it'),
            FakeAnthropic::text('Done'),
        ]);

        Streams::drain((new AssistantAgent([new ResearcherAgent([new SummarizerAgent])]))->stream('Hi'));
        $run = ($this->stored)()->assertVolatileColumns();

        expect(array_map(fn (array $row) => [$row[0], $row[2], $row[4]], $run->outline(($this->labels)())))->toBe([
            ['agent', null, 1], ['step', 'parent', 2], ['tool', 'parent', 3], ['agent', 'tool1', 4], ['step', 'child', 5],
            ['tool', 'child', 6], ['agent', 'tool2', 7], ['step', 'grandchild', 8], ['step', 'child', 9], ['step', 'parent', 10],
        ])->and($run->trace()['streamed'])->toBeTrue()
            ->and($run->trace()['status'])->toBe('completed');
    });

    it('records a hand-prompted child of a streamed parent under the tool call', function () {
        FakeAnthropic::script([($this->delegating)('ask'), FakeAnthropic::text('found it'), FakeAnthropic::text('Done')]);

        $ask = new CallbackTool('ask', fn () => (new ResearcherAgent)->prompt('Dig')->text);

        Streams::drain((new AssistantAgent([$ask]))->stream('Hi'));
        $run = ($this->stored)()->assertVolatileColumns();

        expect($run->outline(($this->labels)()))->toBe(oneLevelTree('ask'));
    });
});

describe('a sub-agent that fails', function () {
    it('fails only the child when the parent delegated through an agent tool', function () {
        FakeAnthropic::script([($this->delegating)('ResearcherAgent'), FakeAnthropic::error(500, 'Server error'), FakeAnthropic::text('Done')]);

        $response = (new AssistantAgent([new ResearcherAgent]))->prompt('Hi', model: FakeAnthropic::MODEL);
        $run = ($this->stored)()->assertVolatileColumns();

        $failure = Captured::failure('exception', RequestException::class, $this->sdk->sole(AgentFailed::class)->event->exception->getMessage(), 'step', 500);

        expect($response->text)->toBe('Done')
            ->and(Captured::pick([$run->trace()], [...Failures::TRACE, 'child_failed'])[0])->toBe(Failures::trace('completed', false, 6, [], [
                'input_tokens' => 20, 'output_tokens' => 10, 'unpriced_span_count' => 2,
            ]) + ['child_failed' => true])
            ->and(Captured::pick($run->spans(), Failures::SPAN))->toBe([
                Failures::span('agent', 1, null, 'completed'),
                Failures::span('step', 1, 0, 'completed', [], ['input_tokens' => 10, 'output_tokens' => 5]),
                Failures::span('tool', 1, null, 'completed'),
                Failures::span('agent', 1, null, 'failed', $failure),
                Failures::span('step', 1, 0, 'failed', $failure),
                Failures::span('step', 1, 1, 'completed', [], ['input_tokens' => 10, 'output_tokens' => 5]),
            ])->and($run->spans()[2]['output']['result'])->toStartWith('Agent failed: HTTP request returned status code 500');
    });

    it('fails the tool, the parent and the trace when a hand-prompted child throws', function () {
        FakeAnthropic::script([($this->delegating)('ask'), FakeAnthropic::error(500, 'Server error')]);

        $ask = new CallbackTool('ask', fn () => (new ResearcherAgent)->prompt('Dig')->text);

        Failures::thrown(fn () => (new AssistantAgent([$ask]))->prompt('Hi', model: FakeAnthropic::MODEL));
        $run = ($this->stored)()->assertVolatileColumns();

        $message = $this->sdk->of(AgentFailed::class)[0]->event->exception->getMessage();
        $request = RequestException::class;

        expect(Captured::pick([$run->trace()], [...Failures::TRACE, 'child_failed'])[0])->toBe(
            Failures::trace('failed', false, 5, Captured::failure('tool_error', $request, $message, 'tool', 500), ['input_tokens' => 10, 'output_tokens' => 5, 'unpriced_span_count' => 1]) + ['child_failed' => true],
        )->and(Captured::pick($run->spans(), ['type', 'status', 'issue_kind', 'error_source']))->toBe([
            ['type' => 'agent', 'status' => 'failed', 'issue_kind' => 'tool_error', 'error_source' => 'tool'],
            ['type' => 'step', 'status' => 'completed', 'issue_kind' => null, 'error_source' => null],
            ['type' => 'tool', 'status' => 'failed', 'issue_kind' => 'tool_error', 'error_source' => 'tool'],
            ['type' => 'agent', 'status' => 'failed', 'issue_kind' => 'exception', 'error_source' => 'step'],
            ['type' => 'step', 'status' => 'failed', 'issue_kind' => 'exception', 'error_source' => 'step'],
        ]);
    });

    it('records a child that fails over and recovers, leaving the root run unrecovered', function () {
        FakeAnthropic::script([($this->delegating)('ask'), FakeAnthropic::error(429), FakeAnthropic::text('found it'), FakeAnthropic::text('Done')]);

        $ask = new CallbackTool('ask', fn () => (new ResearcherAgent)->prompt('Dig', provider: ['anthropic' => 'model-a', 'backup' => 'model-b'])->text);

        (new AssistantAgent([$ask]))->prompt('Hi', model: FakeAnthropic::MODEL);
        $run = ($this->stored)()->assertVolatileColumns();

        expect(Captured::pick([$run->trace()], ['status', 'recovered', 'child_failed'])[0])->toBe(['status' => 'completed', 'recovered' => false, 'child_failed' => false])
            ->and(Captured::pick($run->spans(), ['type', 'attempt', 'step_number', 'status']))->toBe([
                ['type' => 'agent', 'attempt' => 1, 'step_number' => null, 'status' => 'completed'],
                ['type' => 'step', 'attempt' => 1, 'step_number' => 0, 'status' => 'completed'],
                ['type' => 'tool', 'attempt' => 1, 'step_number' => null, 'status' => 'completed'],
                ['type' => 'agent', 'attempt' => 2, 'step_number' => null, 'status' => 'completed'],
                ['type' => 'step', 'attempt' => 1, 'step_number' => 0, 'status' => 'failed'],
                ['type' => 'step', 'attempt' => 2, 'step_number' => 0, 'status' => 'completed'],
                ['type' => 'step', 'attempt' => 1, 'step_number' => 1, 'status' => 'completed'],
            ]);
    });
});

describe('a sub-agent the recorder cannot attach', function () {
    it('records nothing for a child whose parent it never saw', function () {
        AssistantAgent::fake(['Hello']);
        (new AssistantAgent)->prompt('Hi');
        Trail::flush();

        $prompting = $this->sdk->sole(PromptingAgent::class)->event;
        $starting = $this->sdk->sole(StartingStep::class)->event;
        $completed = $this->sdk->sole(StepCompleted::class)->event;
        $original = $prompting->prompt;

        $orphan = new AgentPrompt($original->agent, 'Orphan', [], $original->provider, $original->model, parentInvocationId: 'unknown-parent', parentToolInvocationId: 'unknown-tool');

        $before = [$this->inserts, (new DatabaseStoreProbe)->traceCount(), (new DatabaseStoreProbe)->spanCount()];

        event(new PromptingAgent('orphan-run', $orphan));
        event(new StartingStep('orphan-run', 0, $starting->agent, $starting->provider, $starting->model, true, $starting->messages, $starting->options));
        event(new StepCompleted('orphan-run', 0, $completed->agent, $completed->provider, $completed->model, true, $completed->response, 1.0));
        event(new AgentPrompted('orphan-run', $orphan, $this->sdk->sole(AgentPrompted::class)->event->response));
        Trail::flush();

        expect([$this->inserts, (new DatabaseStoreProbe)->traceCount(), (new DatabaseStoreProbe)->spanCount()])->toBe($before)
            ->and((new DatabaseStoreProbe)->trace('orphan-run'))->toBeNull();
    });

    it('ignores what a sub-agent does after its root finished, and records no later attempt', function () {
        FakeAnthropic::script([
            ($this->delegating)('ask'),
            FakeAnthropic::text('first try'),
            FakeAnthropic::text('Done'),
            FakeAnthropic::text('second try'),
        ]);

        $child = null;

        // The child's stream is abandoned after its first event, so it never reaches a terminal event.
        $ask = new CallbackTool('ask', function () use (&$child) {
            $child = (new ResearcherAgent)->stream('Dig');
            Streams::drain($child, 3);

            return 'abandoned';
        });

        (new AssistantAgent([$ask]))->prompt('Hi', model: FakeAnthropic::MODEL);

        // Iterating the child again starts a new attempt under its own invocation id, after its root ended.
        Streams::drain($child);
        $run = ($this->stored)();

        expect($run->outline(($this->labels)()))->toBe([
            ['agent', 'AssistantAgent', null, 1, 1, 'completed'],
            ['step', 'step', 'parent', 1, 2, 'completed'],
            ['tool', 'ask', 'parent', 1, 3, 'completed'],
            ['agent', 'ResearcherAgent', 'tool1', 1, 4, 'running'],
            ['step', 'step', 'child', 1, 5, 'running'],
            ['step', 'step', 'parent', 1, 6, 'completed'],
        ]);

        // The second iteration started the child again and ran a step; none of it reached the spans.
        $child = Captured::pick($run->rawSpans(), ['type', 'attempt', 'status', 'issue_kind', 'ended_at', 'duration_ms', 'output', 'input_tokens', 'sequence']);

        expect($child[3])->toBe(['type' => 'agent', 'attempt' => 1, 'status' => 'running', 'issue_kind' => null, 'ended_at' => null, 'duration_ms' => null, 'output' => null, 'input_tokens' => null, 'sequence' => 4])
            ->and($child[4])->toBe(['type' => 'step', 'attempt' => 1, 'status' => 'running', 'issue_kind' => null, 'ended_at' => null, 'duration_ms' => null, 'output' => null, 'input_tokens' => null, 'sequence' => 5])
            ->and($run->trace()['span_count'])->toBe(6);
    });
});

describe('a streamed parent abandoned while its sub-agent is running', function () {
    // Events the consumer receives: 1-7 are the parent's first step, 8-11 the sub-agent's progress as
    // preliminary tool results. Stopping after 9 leaves the sub-agent's first step open.
    beforeEach(function () {
        $this->abandonedScript = fn (array $more = []) => FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'ResearcherAgent', 'input' => ['task' => 'Dig']]], text: 'Let me look'),
            FakeAnthropic::text('found it now'),
            ...$more,
        ]);
    });

    it('is flushed as running with exactly the spans seen so far', function () {
        ($this->abandonedScript)();

        $stream = (new AssistantAgent([new ResearcherAgent]))->stream('Hi');
        Streams::drain($stream, 9);

        $run = ($this->stored)();

        expect($run->rawTrace()['status'])->toBe('running')
            ->and($run->outline(($this->labels)()))->toBe([
                ['agent', 'AssistantAgent', null, 1, 1, 'running'],
                ['step', 'step', 'parent', 1, 2, 'completed'],
                ['tool', 'ResearcherAgent', 'parent', 1, 3, 'running'],
                ['agent', 'ResearcherAgent', 'tool1', 1, 4, 'running'],
                ['step', 'step', 'child', 1, 5, 'running'],
            ])->and(array_column($run->rawSpans(), 'ended_at'))->toBe([null, $run->rawSpans()[1]['ended_at'], null, null, null])
            ->and($run->rawSpans()[1]['ended_at'])->not->toBeNull()
            ->and(array_column($run->rawSpans(), 'duration_ms')[0])->toBeNull();

        $queries = 0;
        DB::listen(function () use (&$queries) {
            $queries++;
        });
        Trail::flush();

        expect($queries)->toBe(0);
    });

    it('closes the abandoned attempt\'s tool, sub-agent and their open spans as abandoned when the stream is iterated again', function () {
        ($this->abandonedScript)([
            FakeAnthropic::toolUse([['id' => 'toolu_2', 'name' => 'ResearcherAgent', 'input' => ['task' => 'Dig']]], text: 'Let me look'),
            FakeAnthropic::text('found it now'),
            FakeAnthropic::text('Done'),
        ]);

        $stream = (new AssistantAgent([new ResearcherAgent]))->stream('Hi');
        Streams::drain($stream, 9);

        [$parentId, $oldChildId] = $this->sdk->invocationIds();
        $childStart = $this->sdk->of(StartingStep::class)[1]->event;
        $parentCompleted = $this->sdk->of(StepCompleted::class)[0]->event;

        // Once the second attempt has started, an event for the abandoned sub-agent must not reach any span.
        $parentSteps = 0;
        Event::listen(StartingStep::class, function (StartingStep $event) use (&$parentSteps, $parentId, $oldChildId, $childStart, $parentCompleted) {
            if ($event->invocationId === $parentId && ++$parentSteps === 2) {
                event(new StepCompleted($oldChildId, 0, $childStart->agent, $childStart->provider, $childStart->model, true, $parentCompleted->response, 1.0));
            }
        });

        Streams::drain($stream);
        $run = ($this->stored)();

        expect($run->rawTrace()['status'])->toBe('completed')
            ->and($run->rawTrace()['recovered'])->toBeFalse()
            ->and(array_map(fn (array $span) => [$span['type'], $span['attempt'], $span['status'], $span['issue_kind'], $span['ended_at'] === null, $span['error_class']], $run->rawSpans()))->toBe([
                ['agent', 2, 'completed', null, false, null],
                // Attempt 1: the parent's finished step stays as it was; its tool, the sub-agent under it and the sub-agent's step were left running.
                ['step', 1, 'completed', null, false, null],
                ['tool', 1, 'incomplete', 'abandoned', true, null],
                ['agent', 1, 'incomplete', 'abandoned', true, null],
                ['step', 1, 'incomplete', 'abandoned', true, null],
                // Attempt 2 ran to the end.
                ['step', 2, 'completed', null, false, null],
                ['tool', 2, 'completed', null, false, null],
                ['agent', 1, 'completed', null, false, null],
                ['step', 1, 'completed', null, false, null],
                ['step', 2, 'completed', null, false, null],
            ])->and(array_column($run->rawSpans(), 'duration_ms')[2])->toBeNull()
            ->and($run->rawSpans()[3]['parent_id'])->toBe($run->spanId(2))
            ->and($run->rawSpans()[7]['parent_id'])->toBe($run->spanId(6));
    });
});

describe('a sub-agent whose tool span is missing', function () {
    // Hand-built events: a root, and a child that names the root but a tool call Trail never saw, so the
    // child's agent span hangs directly under the root's agent span.
    beforeEach(function () {
        AssistantAgent::fake(['Hello']);
        (new AssistantAgent)->prompt('Hi');
        Trail::flush();

        $original = $this->sdk->sole(PromptingAgent::class)->event->prompt;
        $starting = $this->sdk->sole(StartingStep::class)->event;
        $completed = $this->sdk->sole(StepCompleted::class)->event;
        $response = $this->sdk->sole(AgentPrompted::class)->event->response;

        $this->rootPrompt = new AgentPrompt($original->agent, 'Root', [], $original->provider, $original->model);
        $this->childPrompt = new AgentPrompt($original->agent, 'Child', [], $original->provider, $original->model, parentInvocationId: 'root-run', parentToolInvocationId: 'missing-tool');

        $this->startRoot = fn () => event(new PromptingAgent('root-run', $this->rootPrompt));
        $this->startChild = fn () => event(new PromptingAgent('child-run', $this->childPrompt));
        $this->childStep = function () use ($starting, $completed, $response) {
            event(new StartingStep('child-run', 0, $starting->agent, $starting->provider, $starting->model, true, $starting->messages, $starting->options));
            event(new StepCompleted('child-run', 0, $completed->agent, $completed->provider, $completed->model, true, $completed->response, 1.0));
            event(new AgentPrompted('child-run', $this->childPrompt, $response));
        };
        $this->read = function (): Captured {
            Trail::flush();

            return Captured::read('root-run');
        };
    });

    it('hangs the child under the run itself', function () {
        ($this->startRoot)();
        ($this->startChild)();
        $run = ($this->read)();

        expect($run->outline(['root-run' => 'parent']))->toBe([
            ['agent', 'AssistantAgent', null, 1, 1, 'running'],
            ['agent', 'AssistantAgent', 'parent', 1, 2, 'running'],
        ]);
    });

    it('does not close the child as the parent\'s own span when the parent fails', function () {
        ($this->startRoot)();
        ($this->startChild)();
        event(new AgentFailed('root-run', $this->rootPrompt, new RuntimeException('boom')));
        $run = ($this->read)();

        expect($run->rawTrace()['status'])->toBe('failed')
            ->and(Captured::pick($run->spans(), ['type', 'status', 'issue_kind', 'error_class']))->toBe([
                ['type' => 'agent', 'status' => 'failed', 'issue_kind' => 'exception', 'error_class' => RuntimeException::class],
                ['type' => 'agent', 'status' => 'running', 'issue_kind' => null, 'error_class' => null],
            ]);
    });

    it('abandons the child, and drops its run, when the parent starts a new attempt', function () {
        ($this->startRoot)();
        ($this->startChild)();
        ($this->startRoot)();

        // Everything the abandoned child does from here on is ignored.
        ($this->childStep)();
        $run = ($this->read)();

        expect(Captured::pick($run->spans(), ['type', 'attempt', 'status', 'issue_kind']))->toBe([
            ['type' => 'agent', 'attempt' => 2, 'status' => 'running', 'issue_kind' => null],
            ['type' => 'agent', 'attempt' => 1, 'status' => 'incomplete', 'issue_kind' => 'abandoned'],
        ])->and($run->rawSpans()[1]['ended_at'])->toBeNull()
            ->and($run->rawSpans()[1]['output'])->toBeNull();
    });

    it('lets the child finish normally while the parent is still on its attempt', function () {
        ($this->startRoot)();
        ($this->startChild)();
        ($this->childStep)();
        $run = ($this->read)();

        expect(Captured::pick($run->spans(), ['type', 'status']))->toBe([
            ['type' => 'agent', 'status' => 'running'],
            ['type' => 'agent', 'status' => 'completed'],
            ['type' => 'step', 'status' => 'completed'],
        ]);
    });
});

describe('embeddings inside a sub-agent', function () {
    // Http::fake keeps the first stub that matches, so each test fakes the embeddings API itself.
    beforeEach(function () {
        config(['trail.pricing.openai' => ['text-embedding-3-small' => ['input' => 2.0]]]);

        $this->embedded = fn () => Http::fake(['api.openai.com/*' => Http::response([
            'data' => [['embedding' => [0.1, 0.2]]],
            'usage' => ['prompt_tokens' => 7, 'total_tokens' => 7],
        ])]);
    });

    it('nests an embeddings call made in the child\'s tool under that tool, not under the parent\'s', function () {
        ($this->embedded)();
        FakeAnthropic::script([
            ($this->delegating)('ResearcherAgent'),
            FakeAnthropic::toolUse([['id' => 'toolu_2', 'name' => 'embed', 'input' => ['query' => 'x']]]),
            FakeAnthropic::text('found it'),
            FakeAnthropic::text('Done'),
        ]);

        $embed = new CallbackTool('embed', fn () => (string) count(Embeddings::for(['a'])->generate()));

        (new AssistantAgent([new ResearcherAgent([$embed])]))->prompt('Hi');
        $run = ($this->stored)()->assertVolatileColumns();

        expect($run->outline(($this->labels)()))->toBe([
            ['agent', 'AssistantAgent', null, 1, 1, 'completed'],
            ['step', 'step', 'parent', 1, 2, 'completed'],
            ['tool', 'ResearcherAgent', 'parent', 1, 3, 'completed'],
            ['agent', 'ResearcherAgent', 'tool1', 1, 4, 'completed'],
            ['step', 'step', 'child', 1, 5, 'completed'],
            ['tool', 'embed', 'child', 1, 6, 'completed'],
            ['embedding', 'embeddings', 'tool2', 1, 7, 'completed'],
            ['step', 'step', 'child', 1, 8, 'completed'],
            ['step', 'step', 'parent', 1, 9, 'completed'],
        ])->and($run->rawSpans()[6]['input_tokens'])->toBe(7);
    });

    it('closes an embedding the child\'s tool failed on with the child, leaving the parent\'s run alone', function () {
        Http::fake(['api.openai.com/*' => Http::response(['error' => ['message' => 'bad']], 500)]);
        FakeAnthropic::script([
            ($this->delegating)('ResearcherAgent'),
            FakeAnthropic::toolUse([['id' => 'toolu_2', 'name' => 'embed', 'input' => ['query' => 'x']]]),
            FakeAnthropic::text('Done'),
        ]);

        $embed = new CallbackTool('embed', fn () => (string) count(Embeddings::for(['a'])->generate()));

        (new AssistantAgent([new ResearcherAgent([$embed])]))->prompt('Hi');
        $run = ($this->stored)()->assertVolatileColumns(untimed: [6]);

        expect(Captured::pick($run->spans(), ['type', 'status', 'error_source']))->toBe([
            ['type' => 'agent', 'status' => 'completed', 'error_source' => null],
            ['type' => 'step', 'status' => 'completed', 'error_source' => null],
            ['type' => 'tool', 'status' => 'completed', 'error_source' => null],
            ['type' => 'agent', 'status' => 'failed', 'error_source' => 'tool'],
            ['type' => 'step', 'status' => 'completed', 'error_source' => null],
            ['type' => 'tool', 'status' => 'failed', 'error_source' => 'tool'],
            ['type' => 'embedding', 'status' => 'failed', 'error_source' => 'tool'],
            ['type' => 'step', 'status' => 'completed', 'error_source' => null],
        ])->and($run->rawSpans()[6]['parent_id'])->toBe($run->spanId(5))
            ->and(Captured::pick([$run->trace()], ['status', 'child_failed'])[0])->toBe(['status' => 'completed', 'child_failed' => true]);
    });

    it('nests an embeddings call made after an inner tool returned under the outer tool that is still running', function () {
        ($this->embedded)();
        FakeAnthropic::script([
            ($this->delegating)('outer'),
            FakeAnthropic::toolUse([['id' => 'toolu_2', 'name' => 'inner', 'input' => ['query' => 'x']]]),
            FakeAnthropic::text('found it'),
            FakeAnthropic::text('Done'),
        ]);

        $inner = new CallbackTool('inner', fn () => 'inner result');
        $outer = new CallbackTool('outer', function () use ($inner) {
            $found = (new ResearcherAgent([$inner]))->prompt('Dig')->text;
            Embeddings::for(['a'])->generate();

            return $found;
        });

        (new AssistantAgent([$outer]))->prompt('Hi');
        $run = ($this->stored)()->assertVolatileColumns();

        expect($run->outline(($this->labels)()))->toBe([
            ['agent', 'AssistantAgent', null, 1, 1, 'completed'],
            ['step', 'step', 'parent', 1, 2, 'completed'],
            ['tool', 'outer', 'parent', 1, 3, 'completed'],
            ['agent', 'ResearcherAgent', 'tool1', 1, 4, 'completed'],
            ['step', 'step', 'child', 1, 5, 'completed'],
            ['tool', 'inner', 'child', 1, 6, 'completed'],
            ['step', 'step', 'child', 1, 7, 'completed'],
            ['embedding', 'embeddings', 'tool1', 1, 8, 'completed'],
            ['step', 'step', 'parent', 1, 9, 'completed'],
        ]);
    });
});

describe('sub-agents in more shapes', function () {
    it('records the same sub-agent run by two sibling tool calls in one step as two agent spans, each under its own tool call', function () {
        FakeAnthropic::script([
            FakeAnthropic::toolUse([
                ['id' => 'toolu_1', 'name' => 'ResearcherAgent', 'input' => ['task' => 'First']],
                ['id' => 'toolu_2', 'name' => 'ResearcherAgent', 'input' => ['task' => 'Second']],
            ]),
            FakeAnthropic::text('first answer'),
            FakeAnthropic::text('second answer'),
            FakeAnthropic::text('Done'),
        ]);

        (new AssistantAgent([new ResearcherAgent]))->prompt('Hi');
        $run = ($this->stored)()->assertVolatileColumns();

        [$parentId, $firstChildId, $secondChildId] = $this->sdk->invocationIds();
        $tools = array_map(fn ($entry) => $entry->event->toolInvocationId, $this->sdk->of(InvokingTool::class));

        $spans = Captured::pick($run->rawSpans(), ['id', 'type', 'name', 'parent_id', 'status']);
        $agents = array_values(array_filter($spans, fn (array $span) => $span['type'] === 'agent' && $span['id'] !== $parentId));

        expect($agents)->toHaveCount(2)
            ->and(array_column($agents, 'id'))->toBe([$firstChildId, $secondChildId])
            ->and(array_column($agents, 'parent_id'))->toBe($tools)
            ->and(array_column($agents, 'status'))->toBe(['completed', 'completed'])
            ->and(array_column(array_filter($spans, fn (array $span) => $span['type'] === 'tool'), 'id'))->toBe($tools)
            ->and(count(array_unique($tools)))->toBe(2)
            ->and($run->trace()['span_count'])->toBe(count($spans));
    });

    it('marks the trace child_failed when a grandchild fails', function () {
        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'ResearcherAgent', 'input' => ['task' => 'Dig']]]),
            FakeAnthropic::toolUse([['id' => 'toolu_2', 'name' => 'SummarizerAgent', 'input' => ['task' => 'Condense']]]),
            FakeAnthropic::error(500, 'Server error'),
            FakeAnthropic::text('found it'),
            FakeAnthropic::text('Done'),
        ]);

        (new AssistantAgent([new ResearcherAgent([new SummarizerAgent])]))->prompt('Hi');
        $run = ($this->stored)()->assertVolatileColumns();

        expect(Captured::pick([$run->trace()], ['status', 'child_failed'])[0])->toBe(['status' => 'completed', 'child_failed' => true])
            ->and(Captured::pick($run->spans(), ['type', 'agent_class', 'status']))->toBe([
                ['type' => 'agent', 'agent_class' => AssistantAgent::class, 'status' => 'completed'],
                ['type' => 'step', 'agent_class' => null, 'status' => 'completed'],
                ['type' => 'tool', 'agent_class' => null, 'status' => 'completed'],
                ['type' => 'agent', 'agent_class' => ResearcherAgent::class, 'status' => 'completed'],
                ['type' => 'step', 'agent_class' => null, 'status' => 'completed'],
                ['type' => 'tool', 'agent_class' => null, 'status' => 'completed'],
                ['type' => 'agent', 'agent_class' => SummarizerAgent::class, 'status' => 'failed'],
                ['type' => 'step', 'agent_class' => null, 'status' => 'failed'],
                ['type' => 'step', 'agent_class' => null, 'status' => 'completed'],
                ['type' => 'step', 'agent_class' => null, 'status' => 'completed'],
            ]);
    });

    it('marks the trace of a streamed parent child_failed when its streamed child fails', function () {
        FakeAnthropic::script([($this->delegating)('ResearcherAgent'), FakeAnthropic::error(500, 'Server error'), FakeAnthropic::text('Done')]);

        Streams::drain((new AssistantAgent([new ResearcherAgent]))->stream('Hi', model: FakeAnthropic::MODEL));
        $run = ($this->stored)()->assertVolatileColumns();

        expect(Captured::pick([$run->trace()], ['status', 'streamed', 'child_failed'])[0])->toBe(['status' => 'completed', 'streamed' => true, 'child_failed' => true])
            ->and(Captured::pick($run->spans(), ['type', 'status']))->toBe([
                ['type' => 'agent', 'status' => 'completed'],
                ['type' => 'step', 'status' => 'completed'],
                ['type' => 'tool', 'status' => 'completed'],
                ['type' => 'agent', 'status' => 'failed'],
                ['type' => 'step', 'status' => 'failed'],
                ['type' => 'step', 'status' => 'completed'],
            ]);
    });

    it('leaves the trace of a plain parent unstreamed when a child inside its tool is streamed', function () {
        FakeAnthropic::script([($this->delegating)('ask'), FakeAnthropic::text('found it'), FakeAnthropic::text('Done')]);

        $ask = new CallbackTool('ask', function () {
            $child = (new ResearcherAgent)->stream('Dig');
            Streams::drain($child);

            return (string) $child->text;
        });

        (new AssistantAgent([$ask]))->prompt('Hi', model: FakeAnthropic::MODEL);
        $run = ($this->stored)()->assertVolatileColumns();

        expect($run->outline(($this->labels)()))->toBe(oneLevelTree('ask'))
            ->and(Captured::pick([$run->trace()], ['status', 'streamed'])[0])->toBe(['status' => 'completed', 'streamed' => false]);
    });
});
