<?php

use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Tools\LookupTool;
use Illuminate\Http\Client\Response;
use Laravel\Ai\Events\AgentPrompted;
use Laravel\Ai\Events\InvokingTool;
use Laravel\Ai\Events\PromptingAgent;
use Laravel\Ai\Events\StartingStep;
use Laravel\Ai\Events\StepCompleted;
use Laravel\Ai\Events\ToolInvoked;
use Laravel\Ai\Gateway\TextGenerationOptions;
use Laravel\Ai\Messages\AssistantMessage;
use Laravel\Ai\Messages\ToolResultMessage;
use Laravel\Ai\Messages\UserMessage;
use Laravel\Ai\Providers\AnthropicProvider;
use Laravel\Ai\Responses\Data\FinishReason;
use Laravel\Ai\Responses\Data\ToolCall;

/*
|--------------------------------------------------------------------------
| The non-streamed agent run
|--------------------------------------------------------------------------
|
| Pins down which events a ->prompt() call fires, in what order, and the
| data each one carries. Order is asserted against the SDK's own fakes;
| data that only a provider response can supply (usage, the responding
| model, the raw response) is asserted against the real Anthropic gateway
| with its HTTP faked.
|
*/

describe('event order', function () {
    it('fires prompt, one step and the terminal event for a run without tools', function () {
        AssistantAgent::fake(['Hello there']);

        $response = (new AssistantAgent)->prompt('Hi');

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'AgentPrompted',
        ])->and($response->text)->toBe('Hello there');
    });

    it('runs a tool after its step completes and before the next step starts', function () {
        AssistantAgent::fake([new ToolCall('call_1', 'lookup', ['query' => 'laravel']), 'Done']);

        (new AssistantAgent([new LookupTool]))->prompt('Hi');

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'InvokingTool(lookup)',
            'ToolInvoked(lookup)',
            'StartingStep#1',
            'StepCompleted#1',
            'AgentPrompted',
        ]);
    });

    it('numbers steps from zero across several tool rounds', function () {
        AssistantAgent::fake([
            new ToolCall('call_1', 'lookup', ['query' => 'one']),
            new ToolCall('call_2', 'lookup', ['query' => 'two']),
            new ToolCall('call_3', 'lookup', ['query' => 'three']),
            'Done',
        ]);

        // maxSteps defaults to round(1.5 x tools), which would be 2 here, so the budget is raised by adding tools.
        (new AssistantAgent([new LookupTool, new LookupTool, new LookupTool]))->prompt('Hi');

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'StartingStep#0', 'StepCompleted#0', 'InvokingTool(lookup)', 'ToolInvoked(lookup)',
            'StartingStep#1', 'StepCompleted#1', 'InvokingTool(lookup)', 'ToolInvoked(lookup)',
            'StartingStep#2', 'StepCompleted#2', 'InvokingTool(lookup)', 'ToolInvoked(lookup)',
            'StartingStep#3', 'StepCompleted#3',
            'AgentPrompted',
        ]);
    });

    it('runs every tool call of one step back to back, in the order the model asked for them', function () {
        FakeAnthropic::script([
            FakeAnthropic::toolUse([
                ['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'one']],
                ['id' => 'toolu_2', 'name' => 'lookup', 'input' => ['query' => 'two']],
            ]),
            FakeAnthropic::text('Done'),
        ]);

        (new AssistantAgent([new LookupTool]))->prompt('Hi');

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'InvokingTool(lookup)', 'ToolInvoked(lookup)',
            'InvokingTool(lookup)', 'ToolInvoked(lookup)',
            'StartingStep#1',
            'StepCompleted#1',
            'AgentPrompted',
        ])->and(array_map(fn ($entry) => $entry->event->result, $this->sdk->of(ToolInvoked::class)))
            ->toBe(['Result for one', 'Result for two']);
    });
});

describe('fakes and real gateways', function () {
    it('produces the same events from the SDK fake as from a real gateway', function () {
        AssistantAgent::fake([new ToolCall('call_1', 'lookup', ['query' => 'laravel']), 'Done']);

        (new AssistantAgent([new LookupTool]))->prompt('Hi');

        $faked = $this->sdk->timeline();

        $this->sdk->clear();

        // A different agent class is not faked, so this run goes through the Anthropic gateway.
        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'laravel']]]),
            FakeAnthropic::text('Done'),
        ]);

        (new class([new LookupTool]) extends AssistantAgent {})->prompt('Hi');

        expect($this->sdk->timeline())->toBe($faked);
    });

    it('keeps the real provider when an agent is faked and swaps only its gateway', function () {
        AssistantAgent::fake(['Hello']);

        (new AssistantAgent)->prompt('Hi');

        $step = $this->sdk->sole(StartingStep::class)->event;

        expect($step->provider)->toBeInstanceOf(AnthropicProvider::class)
            ->and($step->provider->name())->toBe('anthropic');
    });

    it('reports no usage, no raw response and the requested model as the responding model when faked', function () {
        AssistantAgent::fake([new ToolCall('call_1', 'lookup', ['query' => 'laravel']), 'Done']);

        $response = (new AssistantAgent([new LookupTool]))->prompt('Hi', model: 'requested-model');

        foreach ($this->sdk->of(StepCompleted::class) as $entry) {
            expect($entry->event->response->usage->inputTokens)->toBe(0)
                ->and($entry->event->response->usage->outputTokens)->toBe(0)
                ->and($entry->event->response->meta->model)->toBe('requested-model')
                ->and($entry->event->response->raw)->toBeNull();
        }

        expect($response->usage->inputTokens)->toBe(0);
    });
});

describe('event data', function () {
    beforeEach(function () {
        $this->anthropic = FakeAnthropic::script([
            FakeAnthropic::toolUse(
                [['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'laravel']]],
                usage: ['input_tokens' => 100, 'output_tokens' => 20, 'cache_read_input_tokens' => 40, 'cache_creation_input_tokens' => 8],
            ),
            FakeAnthropic::text('Done', usage: ['input_tokens' => 7, 'output_tokens' => 3], model: 'claude-test-responding'),
        ]);

        $this->response = (new AssistantAgent([new LookupTool]))->prompt('Hi', model: FakeAnthropic::MODEL);
    });

    it('uses one 36 character uuid7 invocation id on every event of the run', function () {
        $ids = array_map(fn ($entry) => $entry->invocationId, $this->sdk->all());

        expect(array_unique($ids))->toHaveCount(1)
            ->and($ids[0])->toBe($this->response->invocationId)
            ->and(strlen($ids[0]))->toBe(36)
            ->and($ids[0][14])->toBe('7')
            ->and($this->sdk->sole(PromptingAgent::class)->event->prompt->invocationId)->toBe($ids[0]);
    });

    it('carries the prompt, the agent, the provider and the requested model on PromptingAgent', function () {
        $prompt = $this->sdk->sole(PromptingAgent::class)->event->prompt;

        expect($prompt->prompt)->toBe('Hi')
            ->and($prompt->agent)->toBeInstanceOf(AssistantAgent::class)
            ->and($prompt->provider->name())->toBe('anthropic')
            ->and($prompt->model)->toBe(FakeAnthropic::MODEL)
            ->and($prompt->parentInvocationId)->toBeNull()
            ->and($prompt->parentToolInvocationId)->toBeNull();
    });

    it('carries the messages about to be sent on StartingStep', function () {
        [$first, $second] = $this->sdk->of(StartingStep::class);

        expect($first->event->messages)->toHaveCount(1)
            ->and($first->event->messages[0])->toBeInstanceOf(UserMessage::class)
            ->and($first->event->messages[0]->content)->toBe('Hi');

        expect(array_map(fn ($message) => $message::class, $second->event->messages))->toBe([
            UserMessage::class,
            AssistantMessage::class,
            ToolResultMessage::class,
        ])->and($second->event->messages[1]->toolCalls[0]->name)->toBe('lookup')
            ->and($second->event->messages[2]->toolResults[0]->result)->toBe('Result for laravel');
    });

    it('does not put the system prompt on any event, only on the agent', function () {
        $step = $this->sdk->of(StartingStep::class)[0]->event;

        expect(array_filter($step->messages, fn ($message) => ! $message instanceof UserMessage))->toBe([])
            ->and((string) $step->agent->instructions())->toBe('You are a test assistant.')
            ->and($this->anthropic->requests()[0]['system'])->toBe('You are a test assistant.');
    });

    it('carries generation options on StartingStep, all null when the agent configures nothing', function () {
        $options = $this->sdk->of(StartingStep::class)[0]->event->options;

        expect($options)->toBeInstanceOf(TextGenerationOptions::class)
            ->and($options->maxSteps)->toBeNull()
            ->and($options->maxTokens)->toBeNull()
            ->and($options->temperature)->toBeNull()
            ->and($options->topP)->toBeNull()
            ->and($options->toolChoice)->toBeNull()
            ->and($options->providerOptions)->toBeNull()
            ->and($options->agent)->toBeInstanceOf(AssistantAgent::class);
    });

    it('flags the last step the budget allows as final', function () {
        // One tool gives a budget of round(1.5 x 1) = 2 steps, so the second step is the final one.
        expect(array_map(fn ($entry) => $entry->event->isFinalStep, $this->sdk->of(StartingStep::class)))->toBe([false, true])
            ->and(array_map(fn ($entry) => $entry->event->isFinalStep, $this->sdk->of(StepCompleted::class)))->toBe([false, true]);
    });

    it('reports the requested model on step events and the responding model in the response meta', function () {
        [$first, $second] = $this->sdk->of(StepCompleted::class);

        expect($first->event->model)->toBe(FakeAnthropic::MODEL)
            ->and($first->event->response->meta->model)->toBe(FakeAnthropic::MODEL)
            ->and($second->event->model)->toBe(FakeAnthropic::MODEL)
            ->and($second->event->response->meta->model)->toBe('claude-test-responding')
            ->and($second->event->response->meta->provider)->toBe('anthropic')
            ->and($this->response->meta->model)->toBe('claude-test-responding');
    });

    it('reports a step duration in milliseconds as a float', function () {
        foreach ($this->sdk->of(StepCompleted::class) as $entry) {
            expect($entry->event->time)->toBeFloat()->toBeGreaterThan(0.0)->toBeLessThan(5000.0);
        }
    });

    it('counts cached tokens inside inputTokens and leaves unreported usage fields null', function () {
        [$first, $second] = array_map(fn ($entry) => $entry->event->response->usage, $this->sdk->of(StepCompleted::class));

        // Anthropic reported 100 uncached + 40 cache read + 8 cache write.
        expect($first->inputTokens)->toBe(148)
            ->and($first->uncachedInputTokens())->toBe(100)
            ->and($first->outputTokens)->toBe(20)
            ->and($first->cacheReadInputTokens)->toBe(40)
            ->and($first->cacheWriteInputTokens)->toBe(8)
            ->and($first->reasoningTokens)->toBeNull();

        expect($second->inputTokens)->toBe(7)
            ->and($second->outputTokens)->toBe(3)
            ->and($second->cacheReadInputTokens)->toBeNull()
            ->and($second->cacheWriteInputTokens)->toBeNull()
            ->and($second->reasoningTokens)->toBeNull();
    });

    it('sums step usage into the final response, keeping reported cache counts', function () {
        $usage = $this->sdk->sole(AgentPrompted::class)->event->response->usage;

        expect($usage->inputTokens)->toBe(155)
            ->and($usage->outputTokens)->toBe(23)
            ->and($usage->cacheReadInputTokens)->toBe(40)
            ->and($usage->cacheWriteInputTokens)->toBe(8)
            ->and($usage->reasoningTokens)->toBeNull();
    });

    it('carries text, tool calls and the finish reason on StepCompleted', function () {
        [$first, $second] = array_map(fn ($entry) => $entry->event->response, $this->sdk->of(StepCompleted::class));

        expect($first->finishReason)->toBe(FinishReason::ToolCalls)
            ->and($first->toolCalls)->toHaveCount(1)
            ->and($first->toolCalls[0]->id)->toBe('toolu_1')
            ->and($first->toolCalls[0]->name)->toBe('lookup')
            ->and($first->toolCalls[0]->arguments)->toBe(['query' => 'laravel'])
            ->and($second->finishReason)->toBe(FinishReason::Stop)
            ->and($second->text)->toBe('Done')
            ->and($second->toolCalls)->toBe([]);
    });

    it('exposes the raw HTTP response of a non-streamed step', function () {
        $raw = $this->sdk->of(StepCompleted::class)[0]->event->response->raw;

        expect($raw)->toBeInstanceOf(Response::class)
            ->and($raw->json('id'))->toBe('msg_test');
    });

    it('pairs InvokingTool and ToolInvoked by a tool invocation id that is not the tool call id', function () {
        $invoking = $this->sdk->sole(InvokingTool::class)->event;
        $invoked = $this->sdk->sole(ToolInvoked::class)->event;

        expect($invoking->toolInvocationId)->toBe($invoked->toolInvocationId)
            ->and(strlen($invoking->toolInvocationId))->toBe(36)
            ->and($invoking->toolInvocationId)->not->toBe('toolu_1')
            ->and($invoking->tool)->toBeInstanceOf(LookupTool::class)
            ->and($invoking->arguments)->toBe(['query' => 'laravel'])
            ->and($invoked->result)->toBe('Result for laravel')
            ->and($invoked->time)->toBeFloat()->toBeGreaterThanOrEqual(0.0);
    });

    it('has no tool call id on tool events, so a tool span links to its call through the response only', function () {
        expect(get_object_vars($this->sdk->sole(InvokingTool::class)->event))
            ->toHaveKeys(['invocationId', 'toolInvocationId', 'agent', 'tool', 'arguments'])
            ->not->toHaveKey('toolCallId');

        $result = $this->sdk->sole(AgentPrompted::class)->event->response->toolResults[0];

        expect($result->id)->toBe('toolu_1')->and($result->result)->toBe('Result for laravel');
    });

    it('carries the full response on AgentPrompted', function () {
        $response = $this->sdk->sole(AgentPrompted::class)->event->response;

        expect($response)->toBe($this->response)
            ->and($response->text)->toBe('Done')
            ->and($response->steps)->toHaveCount(2)
            ->and($response->toolCalls)->toHaveCount(1)
            ->and($response->toolResults)->toHaveCount(1)
            ->and($response->conversationId)->toBeNull();
    });
});
