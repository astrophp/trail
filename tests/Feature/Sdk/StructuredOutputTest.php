<?php

use Astro\Trail\Tests\Fixtures\Agents\StructuredAgent;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Tools\LookupTool;
use Laravel\Ai\Events\AgentPrompted;
use Laravel\Ai\Events\StepCompleted;
use Laravel\Ai\Responses\Data\FinishReason;

/*
|--------------------------------------------------------------------------
| Structured output
|--------------------------------------------------------------------------
|
| Some gateways get structured output by offering the model a synthetic
| tool. Pins down what that tool is called and that it never surfaces as
| a tool call or a tool event.
|
*/

it('uses native structured output for Anthropic by default, with no synthetic tool', function () {
    $anthropic = FakeAnthropic::script([FakeAnthropic::text('{"answer":"42"}')]);

    $response = (new StructuredAgent)->prompt('Hi');

    expect($anthropic->requests()[0])->toHaveKey('output_config')->not->toHaveKey('tools')
        ->and($response->structured)->toBe(['answer' => '42'])
        ->and($this->sdk->timeline())->toBe(['PromptingAgent', 'StartingStep#0', 'StepCompleted#0', 'AgentPrompted']);
});

describe('with the synthetic tool', function () {
    beforeEach(fn () => config(['ai.providers.anthropic.use_native_structured_output' => false]));

    it('offers the model a tool called output_structured_data', function () {
        $anthropic = FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'output_structured_data', 'input' => ['answer' => '42']]]),
        ]);

        (new StructuredAgent)->prompt('Hi');

        expect(array_column($anthropic->requests()[0]['tools'], 'name'))->toBe(['output_structured_data'])
            ->and($anthropic->requests()[0]['tool_choice'])->toBe(['type' => 'tool', 'name' => 'output_structured_data']);
    });

    it('fires no tool events for it and ends the run in one step', function () {
        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'output_structured_data', 'input' => ['answer' => '42']]]),
        ]);

        $response = (new StructuredAgent)->prompt('Hi');

        expect($this->sdk->timeline())->toBe(['PromptingAgent', 'StartingStep#0', 'StepCompleted#0', 'AgentPrompted'])
            ->and($response->structured)->toBe(['answer' => '42']);
    });

    it('removes it from the step and the response before a listener sees them', function () {
        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'output_structured_data', 'input' => ['answer' => '42']]]),
        ]);

        (new StructuredAgent)->prompt('Hi');

        $step = $this->sdk->sole(StepCompleted::class)->event->response;
        $response = $this->sdk->sole(AgentPrompted::class)->event->response;

        expect($step->toolCalls)->toBe([])
            ->and($step->finishReason)->toBe(FinishReason::Stop)
            ->and($step->structured)->toBe(['answer' => '42'])
            ->and($step->text)->toBe('{"answer":"42"}')
            ->and($response->toolCalls->all())->toBe([])
            ->and($response->steps[0]->toolCalls)->toBe([]);
    });

    it('still fires tool events for a real tool called alongside it', function () {
        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'laravel']]]),
            FakeAnthropic::toolUse([['id' => 'toolu_2', 'name' => 'output_structured_data', 'input' => ['answer' => '42']]]),
        ]);

        // Two tools keep the step budget at 3, so the second step is not the final one.
        $response = (new StructuredAgent([new LookupTool, new LookupTool]))->prompt('Hi');

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'StartingStep#0', 'StepCompleted#0', 'InvokingTool(lookup)', 'ToolInvoked(lookup)',
            'StartingStep#1', 'StepCompleted#1',
            'AgentPrompted',
        ])->and($response->toolCalls->pluck('name')->all())->toBe(['lookup'])
            ->and($response->structured)->toBe(['answer' => '42']);
    });
});

it('fires no tool events for structured output from the SDK fake', function () {
    StructuredAgent::fake([['answer' => '42']]);

    $response = (new StructuredAgent)->prompt('Hi');

    expect($this->sdk->timeline())->toBe(['PromptingAgent', 'StartingStep#0', 'StepCompleted#0', 'AgentPrompted'])
        ->and($response->structured)->toBe(['answer' => '42']);
});
