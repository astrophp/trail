<?php

use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Agents\ResearcherAgent;
use Astro\Trail\Tests\Fixtures\Agents\SummarizerAgent;
use Astro\Trail\Tests\Fixtures\Tools\CallbackTool;
use Laravel\Ai\Events\AgentFailed;
use Laravel\Ai\Events\AgentPrompted;
use Laravel\Ai\Events\AgentStreamed;
use Laravel\Ai\Events\InvokingTool;
use Laravel\Ai\Events\PromptingAgent;
use Laravel\Ai\Events\StreamingAgent;
use Laravel\Ai\Events\ToolFailed;
use Laravel\Ai\Events\ToolInvoked;
use Laravel\Ai\Gateway\ParentInvocation;
use Laravel\Ai\Responses\Data\ToolCall;
use Laravel\Ai\Tools\AgentTool;

/*
|--------------------------------------------------------------------------
| Sub-agents: an agent run started from inside a tool call
|--------------------------------------------------------------------------
|
| Pins down how a run that is delegated from another run is reported:
| which events the child fires, which parent ids its prompt carries,
| what the parent's tool events say about the delegation, and what
| happens when the child fails. Both delegation styles are covered:
| an agent returned from the parent's tools() (wrapped in AgentTool by
| the SDK) and an agent prompted by hand inside an ordinary tool.
|
| Every scenario runs the real text loop with SDK fakes, one fake per
| agent class. Event data that must be read "at the time of the event"
| comes from the recorded copy (->parentInvocation).
|
*/

describe('an agent used as a tool', function () {
    it('interleaves the child run between the parent tool events', function () {
        AssistantAgent::fake([new ToolCall('call_1', 'ResearcherAgent', ['task' => 'Dig']), 'Done']);
        ResearcherAgent::fake(['found it']);

        $response = (new AssistantAgent([new ResearcherAgent]))->prompt('Hi');

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'InvokingTool(ResearcherAgent)',
            'PromptingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'AgentPrompted',
            'ToolInvoked(ResearcherAgent)',
            'StartingStep#1',
            'StepCompleted#1',
            'AgentPrompted',
        ])->and($response->text)->toBe('Done');
    });

    it('names the tool after the agent class and gives it a task argument', function () {
        AssistantAgent::fake([new ToolCall('call_1', 'ResearcherAgent', ['task' => 'Dig']), 'Done']);
        ResearcherAgent::fake(['found it']);

        (new AssistantAgent([new ResearcherAgent]))->prompt('Hi');

        $invoking = $this->sdk->sole(InvokingTool::class)->event;

        expect($invoking->tool)->toBeInstanceOf(AgentTool::class)
            ->and($invoking->tool->name())->toBe('ResearcherAgent')
            ->and($invoking->tool->agent())->toBeInstanceOf(ResearcherAgent::class)
            ->and($invoking->arguments)->toBe(['task' => 'Dig']);
    });

    it('carries the parent run and tool invocation ids on the child prompt', function () {
        AssistantAgent::fake([new ToolCall('call_1', 'ResearcherAgent', ['task' => 'Dig']), 'Done']);
        ResearcherAgent::fake(['found it']);

        (new AssistantAgent([new ResearcherAgent]))->prompt('Hi');

        [$parentPrompting, $childPrompting] = $this->sdk->of(PromptingAgent::class);
        $invoking = $this->sdk->sole(InvokingTool::class)->event;

        expect($childPrompting->event->prompt->parentInvocationId)->toBe($parentPrompting->invocationId)
            ->and($childPrompting->event->prompt->parentToolInvocationId)->toBe($invoking->toolInvocationId)
            ->and($parentPrompting->event->prompt->parentInvocationId)->toBeNull()
            ->and($parentPrompting->event->prompt->parentToolInvocationId)->toBeNull();
    });

    it('gives the child its own invocation id and a complete event set', function () {
        AssistantAgent::fake([new ToolCall('call_1', 'ResearcherAgent', ['task' => 'Dig']), 'Done']);
        ResearcherAgent::fake(['found it']);

        (new AssistantAgent([new ResearcherAgent]))->prompt('Hi');

        [$parentId, $childId] = $this->sdk->invocationIds();

        expect($this->sdk->invocationIds())->toHaveCount(2)
            ->and($childId)->not->toBe($parentId)
            ->and($this->sdk->forInvocation($childId)->timeline())->toBe([
                'PromptingAgent', 'StartingStep#0', 'StepCompleted#0', 'AgentPrompted',
            ])
            ->and($this->sdk->forInvocation($parentId)->timeline())->toBe([
                'PromptingAgent', 'StartingStep#0', 'StepCompleted#0', 'InvokingTool(ResearcherAgent)',
                'ToolInvoked(ResearcherAgent)', 'StartingStep#1', 'StepCompleted#1', 'AgentPrompted',
            ]);
    });

    it('reports the delegation to the parent as a tool call whose result is the child text', function () {
        AssistantAgent::fake([new ToolCall('call_1', 'ResearcherAgent', ['task' => 'Dig']), 'Done']);
        ResearcherAgent::fake(['found it']);

        (new AssistantAgent([new ResearcherAgent]))->prompt('Hi');

        [$parentId] = $this->sdk->invocationIds();
        $invoking = $this->sdk->sole(InvokingTool::class)->event;
        $invoked = $this->sdk->sole(ToolInvoked::class)->event;

        expect($invoking->invocationId)->toBe($parentId)
            ->and($invoked->invocationId)->toBe($parentId)
            ->and($invoked->toolInvocationId)->toBe($invoking->toolInvocationId)
            ->and($invoked->tool)->toBeInstanceOf(AgentTool::class)
            ->and($invoked->arguments)->toBe(['task' => 'Dig'])
            ->and($invoked->result)->toBe('found it')
            ->and($invoked->agent)->toBeInstanceOf(AssistantAgent::class);
    });

    it('exposes the parent ids through ParentInvocation only while the tool call and the child run are active', function () {
        AssistantAgent::fake([new ToolCall('call_1', 'ResearcherAgent', ['task' => 'Dig']), 'Done']);
        ResearcherAgent::fake(['found it']);

        (new AssistantAgent([new ResearcherAgent]))->prompt('Hi');

        [$parentId] = $this->sdk->invocationIds();
        $toolId = $this->sdk->sole(InvokingTool::class)->event->toolInvocationId;
        $inside = [$parentId, $toolId];
        $outside = [null, null];

        // Step events of the parent are outside the tool call, even the step that follows it...
        expect(array_map(fn ($entry) => $entry->parentInvocation, $this->sdk->all()))->toBe([
            $outside, // PromptingAgent
            $outside, // StartingStep#0
            $outside, // StepCompleted#0
            $inside,  // InvokingTool
            $inside,  // child PromptingAgent
            $inside,  // child StartingStep#0
            $inside,  // child StepCompleted#0
            $inside,  // child AgentPrompted
            $inside,  // ToolInvoked
            $outside, // StartingStep#1
            $outside, // StepCompleted#1
            $outside, // AgentPrompted
        ])->and(ParentInvocation::current())->toBe([null, null]);
    });
});

describe('an agent prompted by hand inside an ordinary tool', function () {
    it('gets the same parent ids as an agent used as a tool', function () {
        AssistantAgent::fake([new ToolCall('call_1', 'ask', ['query' => 'x']), 'Done']);
        ResearcherAgent::fake(['found it']);

        $tool = new CallbackTool('ask', fn () => (new ResearcherAgent)->prompt('Dig')->text);

        (new AssistantAgent([$tool]))->prompt('Hi');

        [$parentPrompting, $childPrompting] = $this->sdk->of(PromptingAgent::class);
        $invoking = $this->sdk->sole(InvokingTool::class)->event;

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'InvokingTool(ask)',
            'PromptingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'AgentPrompted',
            'ToolInvoked(ask)',
            'StartingStep#1',
            'StepCompleted#1',
            'AgentPrompted',
        ])
            ->and($childPrompting->event->prompt->parentInvocationId)->toBe($parentPrompting->invocationId)
            ->and($childPrompting->event->prompt->parentToolInvocationId)->toBe($invoking->toolInvocationId)
            ->and($this->sdk->sole(ToolInvoked::class)->event->result)->toBe('found it');
    });
});

describe('two levels of nesting', function () {
    it('parents the grandchild on the child and the child tool call, not on the top-level run', function () {
        AssistantAgent::fake([new ToolCall('call_1', 'ResearcherAgent', ['task' => 'Dig']), 'Done']);
        ResearcherAgent::fake([new ToolCall('call_2', 'ask', ['query' => 'x']), 'found it']);
        SummarizerAgent::fake(['summary']);

        // The child is delegated to as a tool; the grandchild is prompted by hand inside one of the child's tools...
        $summarize = new CallbackTool('ask', fn () => (new SummarizerAgent)->prompt('Summarise')->text);

        $response = (new AssistantAgent([new ResearcherAgent([$summarize])]))->prompt('Hi');

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'InvokingTool(ResearcherAgent)',
            'PromptingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'InvokingTool(ask)',
            'PromptingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'AgentPrompted',
            'ToolInvoked(ask)',
            'StartingStep#1',
            'StepCompleted#1',
            'AgentPrompted',
            'ToolInvoked(ResearcherAgent)',
            'StartingStep#1',
            'StepCompleted#1',
            'AgentPrompted',
        ])->and($response->text)->toBe('Done');

        [$topId, $childId, $grandchildId] = $this->sdk->invocationIds();
        [$topInvoking, $childInvoking] = array_map(fn ($entry) => $entry->event, $this->sdk->of(InvokingTool::class));
        [$topPrompting, $childPrompting, $grandchildPrompting] = array_map(fn ($entry) => $entry->event->prompt, $this->sdk->of(PromptingAgent::class));

        expect([$topId, $childId, $grandchildId])->each->toBeString()
            ->and(array_unique([$topId, $childId, $grandchildId]))->toHaveCount(3)
            ->and($topInvoking->invocationId)->toBe($topId)
            ->and($childInvoking->invocationId)->toBe($childId)
            ->and($topPrompting->parentInvocationId)->toBeNull()
            ->and($childPrompting->parentInvocationId)->toBe($topId)
            ->and($childPrompting->parentToolInvocationId)->toBe($topInvoking->toolInvocationId)
            ->and($grandchildPrompting->parentInvocationId)->toBe($childId)
            ->and($grandchildPrompting->parentToolInvocationId)->toBe($childInvoking->toolInvocationId)
            ->and($childInvoking->toolInvocationId)->not->toBe($topInvoking->toolInvocationId);
    });

    it('restores the outer parent ids when the inner tool call ends', function () {
        AssistantAgent::fake([new ToolCall('call_1', 'ResearcherAgent', ['task' => 'Dig']), 'Done']);
        ResearcherAgent::fake([new ToolCall('call_2', 'ask', ['query' => 'x']), 'found it']);
        SummarizerAgent::fake(['summary']);

        $summarize = new CallbackTool('ask', fn () => (new SummarizerAgent)->prompt('Summarise')->text);

        (new AssistantAgent([new ResearcherAgent([$summarize])]))->prompt('Hi');

        [$topId, $childId] = $this->sdk->invocationIds();
        [$topInvoking, $childInvoking] = array_map(fn ($entry) => $entry->event, $this->sdk->of(InvokingTool::class));
        $top = [$topId, $topInvoking->toolInvocationId];
        $child = [$childId, $childInvoking->toolInvocationId];

        // After the grandchild's tool call the child's own step events see the top-level tool call again, not [null, null]...
        expect(array_map(fn ($entry) => $entry->label().' '.json_encode($entry->parentInvocation === $top ? 'top' : ($entry->parentInvocation === $child ? 'child' : $entry->parentInvocation)), $this->sdk->all()))->toBe([
            'PromptingAgent [null,null]',
            'StartingStep#0 [null,null]',
            'StepCompleted#0 [null,null]',
            'InvokingTool(ResearcherAgent) "top"',
            'PromptingAgent "top"',
            'StartingStep#0 "top"',
            'StepCompleted#0 "top"',
            'InvokingTool(ask) "child"',
            'PromptingAgent "child"',
            'StartingStep#0 "child"',
            'StepCompleted#0 "child"',
            'AgentPrompted "child"',
            'ToolInvoked(ask) "child"',
            'StartingStep#1 "top"',
            'StepCompleted#1 "top"',
            'AgentPrompted "top"',
            'ToolInvoked(ResearcherAgent) "top"',
            'StartingStep#1 [null,null]',
            'StepCompleted#1 [null,null]',
            'AgentPrompted [null,null]',
        ]);
    });

    it('keeps correct parents when both levels are delegated as tools', function () {
        AssistantAgent::fake([new ToolCall('call_1', 'ResearcherAgent', ['task' => 'Dig']), 'Done']);
        ResearcherAgent::fake([new ToolCall('call_2', 'SummarizerAgent', ['task' => 'Condense']), 'found it']);
        SummarizerAgent::fake(['summary']);

        (new AssistantAgent([new ResearcherAgent([new SummarizerAgent])]))->prompt('Hi');

        [$topId, $childId] = $this->sdk->invocationIds();
        [$topInvoking, $childInvoking] = array_map(fn ($entry) => $entry->event, $this->sdk->of(InvokingTool::class));
        $grandchildPrompt = $this->sdk->of(PromptingAgent::class)[2]->event->prompt;

        expect($this->sdk->names())->toBe([
            'PromptingAgent', 'StartingStep', 'StepCompleted', 'InvokingTool',
            'PromptingAgent', 'StartingStep', 'StepCompleted', 'InvokingTool',
            'PromptingAgent', 'StartingStep', 'StepCompleted', 'AgentPrompted',
            'ToolInvoked', 'StartingStep', 'StepCompleted', 'AgentPrompted',
            'ToolInvoked', 'StartingStep', 'StepCompleted', 'AgentPrompted',
        ])
            ->and($childInvoking->tool->name())->toBe('SummarizerAgent')
            ->and($grandchildPrompt->parentInvocationId)->toBe($childId)
            ->and($grandchildPrompt->parentToolInvocationId)->toBe($childInvoking->toolInvocationId)
            ->and($childInvoking->invocationId)->toBe($childId)
            ->and($topInvoking->invocationId)->toBe($topId);
    });
});

describe('a failing sub-agent', function () {
    it('fails only the child and hands the parent an "Agent failed" result', function () {
        AssistantAgent::fake([new ToolCall('call_1', 'ResearcherAgent', ['task' => 'Dig']), 'Done']);
        ResearcherAgent::fake([fn () => throw new RuntimeException('boom')]);

        $response = (new AssistantAgent([new ResearcherAgent]))->prompt('Hi');

        expect($response->text)->toBe('Done')
            ->and($this->sdk->timeline())->toBe([
                'PromptingAgent',
                'StartingStep#0',
                'StepCompleted#0',
                'InvokingTool(ResearcherAgent)',
                'PromptingAgent',
                'StartingStep#0',
                'StepFailed#0',
                'AgentFailed',
                'ToolInvoked(ResearcherAgent)',
                'StartingStep#1',
                'StepCompleted#1',
                'AgentPrompted',
            ]);

        [$parentId, $childId] = $this->sdk->invocationIds();
        $failed = $this->sdk->sole(AgentFailed::class);

        expect($failed->invocationId)->toBe($childId)
            ->and($failed->event->exception)->toBeInstanceOf(RuntimeException::class)
            ->and($failed->event->exception->getMessage())->toBe('boom')
            ->and($failed->event->prompt->parentInvocationId)->toBe($parentId)
            ->and($failed->event->prompt->parentToolInvocationId)->toBe($this->sdk->sole(InvokingTool::class)->event->toolInvocationId)
            ->and($this->sdk->of(ToolFailed::class))->toBe([])
            ->and($this->sdk->sole(ToolInvoked::class)->event->result)->toBe('Agent failed: boom');
    });

    it('swallows an Error thrown inside the child the same way', function () {
        AssistantAgent::fake([new ToolCall('call_1', 'ResearcherAgent', ['task' => 'Dig']), 'Done']);
        ResearcherAgent::fake([fn () => throw new Error('fatal')]);

        $response = (new AssistantAgent([new ResearcherAgent]))->prompt('Hi');

        expect($response->text)->toBe('Done')
            ->and($this->sdk->sole(ToolInvoked::class)->event->result)->toBe('Agent failed: fatal')
            ->and($this->sdk->of(ToolFailed::class))->toBe([])
            ->and($this->sdk->sole(AgentFailed::class)->event->exception)->toBeInstanceOf(Error::class);
    });

    it('lets the exception reach the parent when the child is prompted by hand', function () {
        AssistantAgent::fake([new ToolCall('call_1', 'ask', ['query' => 'x']), 'Done']);
        ResearcherAgent::fake([fn () => throw new RuntimeException('boom')]);

        $tool = new CallbackTool('ask', fn () => (new ResearcherAgent)->prompt('Dig')->text);

        $caught = null;

        try {
            (new AssistantAgent([$tool]))->prompt('Hi');
        } catch (Throwable $exception) {
            $caught = $exception;
        }

        expect($caught)->toBeInstanceOf(RuntimeException::class)
            ->and($caught->getMessage())->toBe('boom')
            ->and($this->sdk->timeline())->toBe([
                'PromptingAgent',
                'StartingStep#0',
                'StepCompleted#0',
                'InvokingTool(ask)',
                'PromptingAgent',
                'StartingStep#0',
                'StepFailed#0',
                'AgentFailed',
                'ToolFailed(ask)',
                'AgentFailed',
            ]);

        [$childFailed, $parentFailed] = $this->sdk->of(AgentFailed::class);
        [$parentId, $childId] = $this->sdk->invocationIds();
        $toolFailed = $this->sdk->sole(ToolFailed::class);

        expect($childFailed->invocationId)->toBe($childId)
            ->and($parentFailed->invocationId)->toBe($parentId)
            ->and($toolFailed->invocationId)->toBe($parentId)
            ->and($toolFailed->event->exception)->toBe($caught)
            ->and($childFailed->event->exception)->toBe($caught)
            ->and($parentFailed->event->exception)->toBe($caught)
            ->and($this->sdk->of(ToolInvoked::class))->toBe([])
            ->and($parentFailed->parentInvocation)->toBe([null, null]);
    });
});

describe('a streamed parent', function () {
    it('runs the child as a stream with the parent ids, but reports the tool events outside the parent scope', function () {
        AssistantAgent::fake([new ToolCall('call_1', 'ResearcherAgent', ['task' => 'Dig']), 'Done']);
        ResearcherAgent::fake(['found it']);

        $stream = (new AssistantAgent([new ResearcherAgent]))->stream('Hi');
        foreach ($stream as $event) {
            //
        }

        expect($this->sdk->timeline())->toBe([
            'StreamingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'InvokingTool(ResearcherAgent)',
            'StreamingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'AgentStreamed',
            'ToolInvoked(ResearcherAgent)',
            'StartingStep#1',
            'StepCompleted#1',
            'AgentStreamed',
        ])->and($this->sdk->of(PromptingAgent::class))->toBe([])
            ->and($this->sdk->of(AgentPrompted::class))->toBe([]);

        [$parentId, $childId] = $this->sdk->invocationIds();
        [$parentStreaming, $childStreaming] = $this->sdk->of(StreamingAgent::class);
        $invoking = $this->sdk->sole(InvokingTool::class);
        $invoked = $this->sdk->sole(ToolInvoked::class);

        expect($childStreaming->invocationId)->toBe($childId)
            ->and($childStreaming->event->prompt->parentInvocationId)->toBe($parentId)
            ->and($childStreaming->event->prompt->parentToolInvocationId)->toBe($invoking->event->toolInvocationId)
            ->and($parentStreaming->event->prompt->parentInvocationId)->toBeNull()
            ->and($invoked->event->toolInvocationId)->toBe($invoking->event->toolInvocationId)
            ->and($invoked->event->result)->toBe('found it')
            // Unlike the non-streamed path, the parent's own InvokingTool and ToolInvoked are dispatched outside ParentInvocation::within()...
            ->and($invoking->parentInvocation)->toBe([null, null])
            ->and($invoked->parentInvocation)->toBe([null, null])
            // ...while every event of the child run is inside it...
            ->and(array_map(fn ($entry) => $entry->parentInvocation, $this->sdk->forInvocation($childId)->all()))
            ->each->toBe([$parentId, $invoking->event->toolInvocationId])
            ->and(ParentInvocation::current())->toBe([null, null]);
    });

    it('does not run the sub-agent on the final step', function () {
        // maxSteps defaults to round(1.5 x 1 tool) = 2, so step 1 is the final step and its tool call is not executed...
        AssistantAgent::fake([
            new ToolCall('call_1', 'ResearcherAgent', ['task' => 'Dig']),
            new ToolCall('call_2', 'ResearcherAgent', ['task' => 'Dig again']),
        ]);
        ResearcherAgent::fake(['found it', 'found more']);

        $stream = (new AssistantAgent([new ResearcherAgent]))->stream('Hi');
        foreach ($stream as $event) {
            //
        }

        expect($this->sdk->timeline())->toBe([
            'StreamingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'InvokingTool(ResearcherAgent)',
            'StreamingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'AgentStreamed',
            'ToolInvoked(ResearcherAgent)',
            'StartingStep#1',
            'StepCompleted#1',
            'AgentStreamed',
        ]);
    });

    it('reports a failing child as an "Agent failed" result and no ToolFailed', function () {
        AssistantAgent::fake([new ToolCall('call_1', 'ResearcherAgent', ['task' => 'Dig']), 'Done']);
        ResearcherAgent::fake([fn () => throw new RuntimeException('boom')]);

        $stream = (new AssistantAgent([new ResearcherAgent]))->stream('Hi');
        foreach ($stream as $event) {
            //
        }

        expect($this->sdk->timeline())->toBe([
            'StreamingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'InvokingTool(ResearcherAgent)',
            'StreamingAgent',
            'StartingStep#0',
            'StepFailed#0',
            'AgentFailed',
            'ToolInvoked(ResearcherAgent)',
            'StartingStep#1',
            'StepCompleted#1',
            'AgentStreamed',
        ])->and($this->sdk->sole(ToolInvoked::class)->event->result)->toBe('Agent failed: boom')
            ->and($this->sdk->sole(AgentFailed::class)->invocationId)->toBe($this->sdk->invocationIds()[1])
            ->and($this->sdk->of(ToolFailed::class))->toBe([]);
    });

    it('still scopes an ordinary tool, and an agent prompted by hand inside it, to the parent ids', function () {
        AssistantAgent::fake([new ToolCall('call_1', 'ask', ['query' => 'x']), 'Done']);
        ResearcherAgent::fake(['found it']);

        $tool = new CallbackTool('ask', fn () => (new ResearcherAgent)->prompt('Dig')->text);

        $stream = (new AssistantAgent([$tool]))->stream('Hi');
        foreach ($stream as $event) {
            //
        }

        [$parentId] = $this->sdk->invocationIds();
        $invoking = $this->sdk->sole(InvokingTool::class);
        $inside = [$parentId, $invoking->event->toolInvocationId];

        expect($this->sdk->timeline())->toBe([
            'StreamingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'InvokingTool(ask)',
            'PromptingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'AgentPrompted',
            'ToolInvoked(ask)',
            'StartingStep#1',
            'StepCompleted#1',
            'AgentStreamed',
        ])->and($invoking->parentInvocation)->toBe($inside)
            ->and($this->sdk->sole(ToolInvoked::class)->parentInvocation)->toBe($inside)
            ->and($this->sdk->sole(PromptingAgent::class)->event->prompt->parentInvocationId)->toBe($parentId)
            ->and($this->sdk->sole(AgentStreamed::class)->event->prompt->parentInvocationId)->toBeNull();
    });
});
