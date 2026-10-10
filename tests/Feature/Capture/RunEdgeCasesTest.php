<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Capture\Captured;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Tools\ApprovalTool;
use Astro\Trail\Tests\Fixtures\Tools\CallbackTool;
use Astro\Trail\Tests\Fixtures\Tools\LookupTool;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Facades\DB;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Events\AgentPrompted;
use Laravel\Ai\Events\InvokingTool;
use Laravel\Ai\Events\PromptingAgent;
use Laravel\Ai\Events\StartingStep;
use Laravel\Ai\Events\StepCompleted;
use Laravel\Ai\Events\ToolInvoked;
use Laravel\Ai\Gateway\StepResponse;
use Laravel\Ai\Responses\AgentResponse;
use Laravel\Ai\Responses\Data\FinishReason;
use Laravel\Ai\Responses\Data\Meta;
use Laravel\Ai\Responses\Data\TextUsage;
use Laravel\Ai\Responses\Data\ToolCall;
use Laravel\Ai\Tools\Request;

it('pauses for approval without a tool span and ends as awaiting approval', function () {
    FakeAnthropic::script([FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'delete_records', 'input' => ['table' => 'users']]])]);

    // An ad-hoc history lets the SDK pause without its conversation tables.
    $response = (new AssistantAgent([new ApprovalTool]))->withMessages([])->prompt('Delete the users', model: FakeAnthropic::MODEL);
    Trail::flush();

    $run = Captured::read($response->invocationId);

    expect($response->hasPendingApprovals())->toBeTrue()
        ->and($run->trace()['status'])->toBe('awaiting_approval')
        ->and(array_column($run->spans(), 'type'))->toBe(['agent', 'step'])
        ->and(array_column($run->spans(), 'status'))->toBe(['awaiting_approval', 'completed']);
});

it('stores the run as completed and leaves nothing behind when a tool result fails to serialize', function (Closure $make) {
    $result = $make();

    AssistantAgent::fake([new ToolCall('call_1', 'lookup', ['query' => 'x']), 'Done']);

    $response = (new AssistantAgent([new CallbackTool('lookup', fn (Request $request) => $result)]))->prompt('Hi', model: FakeAnthropic::MODEL);
    Trail::flush();
    $run = Captured::read($response->invocationId);

    $queries = 0;
    DB::listen(function () use (&$queries) {
        $queries++;
    });

    // The first flush wrote and dropped the run, so a second finds nothing left to write.
    Trail::flush();

    $invoked = $this->sdk->sole(ToolInvoked::class)->event;

    expect($response->text)->toBe('Done')
        ->and($run->trace()['status'])->toBe('completed')
        ->and(array_column($run->spans(), 'status'))->toBe(['completed', 'completed', 'completed', 'completed'])
        ->and($run->spans()[2]['output']['result']['class'])->toEndWith('@anonymous')
        ->and($run->duration(2))->toEqualWithDelta($invoked->time, 1e-6)
        ->and($queries)->toBe(0);
})->with([
    'jsonSerialize throws' => [fn () => new class implements JsonSerializable, Stringable
    {
        public function jsonSerialize(): mixed
        {
            throw new RuntimeException('no json');
        }

        public function __toString(): string
        {
            return 'fine for the SDK';
        }
    }],
]);

it('names a tool that is an anonymous class without a name of its own', function () {
    $tool = new class implements Tool
    {
        public function description(): Stringable|string
        {
            return 'Looks up a value.';
        }

        public function handle(Request $request): Stringable|string
        {
            return 'ok';
        }

        public function schema(JsonSchema $schema): array
        {
            return [];
        }
    };

    FakeAnthropic::script([
        FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => class_basename($tool), 'input' => []]]),
        FakeAnthropic::text('Done'),
    ]);

    $response = (new AssistantAgent([$tool]))->prompt('Hi', model: FakeAnthropic::MODEL);
    Trail::flush();

    $names = array_column(Captured::read($response->invocationId)->spans(), 'name');

    expect($names)->toContain('Anonymous tool')
        ->and(json_encode($names, JSON_THROW_ON_ERROR))->not->toContain('@anonymous');
});

describe('usage the provider reports as zero', function () {
    beforeEach(function () {
        config(['trail.pricing.anthropic' => [FakeAnthropic::MODEL => ['input' => 3.0, 'output' => 15.0, 'cache_read' => 0.30, 'cache_write' => 3.75]]]);
    });

    /** Run one scripted step with the given Anthropic usage block and read back the step row and the trace. */
    function usageRun(array $usage): array
    {
        FakeAnthropic::script([FakeAnthropic::text('x', usage: $usage)]);

        $response = (new AssistantAgent)->prompt('Hi', model: FakeAnthropic::MODEL);
        Trail::flush();

        $run = Captured::read($response->invocationId);

        return [$run->spans()[1], $run->trace()];
    }

    it('keeps a cache read the provider reports with no other tokens, and prices it', function () {
        // The gateway adds cache tokens into the input total, so 0 uncached + 30 read is reported as 30 in.
        [$step, $trace] = usageRun(['input_tokens' => 0, 'output_tokens' => 0, 'cache_read_input_tokens' => 30]);

        expect([$step['input_tokens'], $step['output_tokens'], $step['cache_read_tokens'], $step['cache_write_tokens']])->toBe([30, 0, 30, null])
            ->and($step['cost'])->toBe('0.0000090000')
            ->and([$trace['input_tokens'], $trace['output_tokens'], $trace['cache_read_tokens'], $trace['cost'], $trace['unpriced_span_count']])
            ->toBe([30, 0, 30, '0.0000090000', 0]);
    });

    it('keeps a real zero output next to real input, and prices the step', function () {
        [$step, $trace] = usageRun(['input_tokens' => 5, 'output_tokens' => 0]);

        expect([$step['input_tokens'], $step['output_tokens'], $step['cache_read_tokens']])->toBe([5, 0, null])
            ->and($step['cost'])->toBe('0.0000150000')
            ->and([$trace['input_tokens'], $trace['output_tokens'], $trace['cost'], $trace['unpriced_span_count']])->toBe([5, 0, '0.0000150000', 0]);
    });

    it('stores cache counts the provider reports as zero, rather than treating the step as unreported', function () {
        [$step, $trace] = usageRun(['input_tokens' => 0, 'output_tokens' => 0, 'cache_read_input_tokens' => 0, 'cache_creation_input_tokens' => 0]);

        // A zero-cost step with a price is free, which is different from unpriced.
        expect([$step['input_tokens'], $step['output_tokens'], $step['cache_read_tokens'], $step['cache_write_tokens']])->toBe([0, 0, 0, 0])
            ->and($step['cost'])->toBe('0.0000000000')
            ->and([$trace['input_tokens'], $trace['output_tokens'], $trace['cache_read_tokens'], $trace['cache_write_tokens']])->toBe([0, 0, 0, 0])
            ->and([$trace['cost'], $trace['unpriced_span_count']])->toBe(['0.0000000000', 0]);
    });

    it('keeps a literal zero input and output with a cache read count, which the gateway cannot produce', function () {
        // Built by hand: the gateway never reports less input than cache read, so the event is constructed.
        AssistantAgent::fake(['x']);
        (new AssistantAgent)->prompt('Hi', model: FakeAnthropic::MODEL);

        $prompting = $this->sdk->sole(PromptingAgent::class)->event;
        $starting = $this->sdk->sole(StartingStep::class)->event;
        $id = 'hand-built-run';

        $response = new StepResponse('x', [], FinishReason::Stop, new TextUsage(0, 0, 5), new Meta('anthropic', FakeAnthropic::MODEL));

        event(new PromptingAgent($id, $prompting->prompt));
        event(new StartingStep($id, 0, $starting->agent, $starting->provider, $starting->model, true, $starting->messages, $starting->options));
        event(new StepCompleted($id, 0, $starting->agent, $starting->provider, $starting->model, true, $response, 1.0));
        event(new AgentPrompted($id, $prompting->prompt, new AgentResponse($id, 'x', new TextUsage(0, 0, 5), new Meta)));
        Trail::flush();

        $run = Captured::read($id);
        $step = $run->spans()[1];

        expect([$step['input_tokens'], $step['output_tokens'], $step['cache_read_tokens'], $step['cache_write_tokens']])->toBe([0, 0, 5, null])
            ->and($step['cost'])->toBe('0.0000015000')
            ->and([$run->trace()['input_tokens'], $run->trace()['cache_read_tokens'], $run->trace()['cost']])->toBe([0, 5, '0.0000015000']);
    });
});

it('completes the run and the tool span when a tool result throws on __toString, which the SDK itself never survives', function () {
    // The SDK turns a result into a string for the next step, so this can only reach Trail as an event.
    AssistantAgent::fake([new ToolCall('call_1', 'lookup', ['query' => 'x']), 'Done']);
    $response = (new AssistantAgent([new LookupTool]))->prompt('Hi', model: FakeAnthropic::MODEL);

    $prompting = $this->sdk->sole(PromptingAgent::class)->event;
    $invoking = $this->sdk->sole(InvokingTool::class)->event;
    $id = 'hand-built-run';

    $result = new class implements Stringable
    {
        public function __toString(): string
        {
            throw new RuntimeException('no string');
        }
    };

    event(new PromptingAgent($id, $prompting->prompt));
    event(new InvokingTool($id, 'tool-1', $invoking->agent, $invoking->tool, ['query' => 'x']));
    event(new ToolInvoked($id, 'tool-1', $invoking->agent, $invoking->tool, ['query' => 'x'], $result, 12.5));
    event(new AgentPrompted($id, $prompting->prompt, $response));

    Trail::flush();
    $run = Captured::read($id);

    $queries = 0;
    DB::listen(function () use (&$queries) {
        $queries++;
    });

    Trail::flush();

    expect($run->trace()['status'])->toBe('completed')
        ->and($run->spans()[1]['status'])->toBe('completed')
        ->and($run->spans()[1]['output']['result']['class'])->toEndWith('@anonymous')
        ->and($run->duration(1))->toBe(12.5)
        ->and($queries)->toBe(0);
});
