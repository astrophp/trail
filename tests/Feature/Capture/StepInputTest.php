<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Agents\ResearcherAgent;
use Astro\Trail\Tests\Fixtures\Capture\Captured;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Tools\CallbackTool;
use Astro\Trail\Tests\Fixtures\Tools\LookupTool;
use Laravel\Ai\Events\PromptingAgent;
use Laravel\Ai\Events\StartingStep;
use Laravel\Ai\Messages\AssistantMessage;
use Laravel\Ai\Messages\UserMessage;

/*
|--------------------------------------------------------------------------
| What a step's input stores of the history
|--------------------------------------------------------------------------
|
| Every step sends the whole history again. A step stores only the messages the
| previous step of its attempt did not send, and the number it did send, so the
| history of any step is the stored messages of the steps before it, in order,
| followed by its own.
|
*/

beforeEach(function () {
    $this->stored = function (): Captured {
        Trail::flush();

        return Captured::read($this->sdk->invocationIds()[0]);
    };

    /** The messages and offset each step stored, in order. */
    $this->inputs = fn (Captured $run, ?string $parent = null) => array_values(array_map(
        fn (array $span) => [$span['attempt'], $span['step_number'], $span['input']['messages_offset'], count($span['input']['messages'])],
        array_filter($run->rawSpans(), fn (array $span) => $span['type'] === 'step'),
    ));
});

it('stores the whole prompt for the first step and only what is new for each step after it', function () {
    FakeAnthropic::script([
        FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'a']]]),
        FakeAnthropic::toolUse([['id' => 'toolu_2', 'name' => 'lookup', 'input' => ['query' => 'b']]]),
        FakeAnthropic::text('Done'),
    ]);

    (new AssistantAgent([new LookupTool, new LookupTool, new LookupTool]))->prompt('Hi', model: FakeAnthropic::MODEL);
    $run = ($this->stored)();

    // Each tool round adds the model's call and the result: two messages.
    expect(($this->inputs)($run))->toBe([[1, 0, 0, 1], [1, 1, 1, 2], [1, 2, 3, 2]]);

    $steps = array_values(array_filter($run->rawSpans(), fn (array $span) => $span['type'] === 'step'));
    $sent = array_map(fn ($entry) => count($entry->event->messages), $this->sdk->of(StartingStep::class));

    // The offset plus what is stored is what the step sent.
    foreach ($steps as $position => $step) {
        expect($step['input']['messages_offset'] + count($step['input']['messages']))->toBe($sent[$position]);
    }
});

it('stores an ad-hoc history whole with the first step', function () {
    FakeAnthropic::script([FakeAnthropic::text('ok')]);

    (new AssistantAgent)->withMessages([new UserMessage('earlier question'), new AssistantMessage('earlier answer')])->prompt('Hi', model: FakeAnthropic::MODEL);
    $run = ($this->stored)();
    $step = $run->rawSpans()[1]['input'];

    expect($step['messages_offset'])->toBe(0)
        ->and(array_column($step['messages'], 'content'))->toBe(['earlier question', 'earlier answer', 'Hi']);
});

it('starts again from the whole history when a new attempt starts, and gives a sub-agent its own count', function () {
    FakeAnthropic::script([
        FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'a']]]),
        FakeAnthropic::error(429),
        FakeAnthropic::toolUse([['id' => 'toolu_2', 'name' => 'ask', 'input' => []]]),
        FakeAnthropic::toolUse([['id' => 'toolu_3', 'name' => 'lookup', 'input' => ['query' => 'a']]]),
        FakeAnthropic::text('found it'),
        FakeAnthropic::text('Done'),
    ]);

    $ask = new CallbackTool('ask', fn () => (new ResearcherAgent([new LookupTool]))->prompt('Dig')->text);

    (new AssistantAgent([new LookupTool, $ask]))->prompt('Hi', provider: ['anthropic' => 'model-a', 'backup' => 'model-b']);
    $run = ($this->stored)();

    $steps = array_values(array_filter($run->rawSpans(), fn (array $span) => $span['type'] === 'step'));

    // Attempt 1: step 0 whole, then step 1 (which failed) with the new messages. Attempt 2 starts whole again. The sub-agent's two
    // steps come between the parent's, and it counts for itself.
    expect(array_map(fn (array $step) => [$step['attempt'], $step['step_number'], $step['input']['messages_offset']], $steps))
        ->toBe([[1, 0, 0], [1, 1, 1], [2, 0, 0], [1, 0, 0], [1, 1, 1], [2, 1, 1]])
        ->and(count($steps[2]['input']['messages']))->toBe(1);
});

it('stores a history that is no longer than the last one whole, with offset 0', function () {
    AssistantAgent::fake(['Hello']);
    (new AssistantAgent)->prompt('Hi');

    $prompting = $this->sdk->sole(PromptingAgent::class)->event;
    $starting = $this->sdk->sole(StartingStep::class)->event;
    $id = 'rewritten-history';

    $three = [new UserMessage('one'), new UserMessage('two'), new UserMessage('three')];
    $two = [new UserMessage('rewritten one'), new UserMessage('rewritten two')];

    event(new PromptingAgent($id, $prompting->prompt));
    event(new StartingStep($id, 0, $starting->agent, $starting->provider, $starting->model, false, $three, $starting->options));
    event(new StartingStep($id, 1, $starting->agent, $starting->provider, $starting->model, false, $two, $starting->options));
    event(new StartingStep($id, 2, $starting->agent, $starting->provider, $starting->model, false, $two, $starting->options));
    Trail::flush();

    $steps = array_values(array_filter(Captured::read($id)->rawSpans(), fn (array $span) => $span['type'] === 'step'));

    expect(array_map(fn (array $step) => [$step['input']['messages_offset'], array_column($step['input']['messages'], 'content')], $steps))->toBe([
        [0, ['one', 'two', 'three']],
        [0, ['rewritten one', 'rewritten two']],
        [0, ['rewritten one', 'rewritten two']],
    ]);
});

it('indexes truncated paths into the stored messages', function () {
    config(['trail.capture.max_length' => 20]);
    FakeAnthropic::script([
        FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => []]]),
        FakeAnthropic::text('ok'),
    ]);

    (new AssistantAgent([new CallbackTool('lookup', fn () => str_repeat('r', 50))]))->prompt('Hi', model: FakeAnthropic::MODEL);
    $run = ($this->stored)();
    $second = $run->rawSpans()[3];

    // The tool result is the second message the step stored, whatever its place in the whole history.
    expect($second['input']['messages_offset'])->toBe(1)
        ->and($second['metadata']['truncated'])->toHaveKey('input.messages.1.tool_results.0.result')
        ->and($second['metadata']['truncated']['input.messages.1.tool_results.0.result'])->toBe(50);
});
