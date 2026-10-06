<?php

use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Agents\FailingRepairingAgent;
use Astro\Trail\Tests\Fixtures\Agents\FailingSingleStepAgent;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Tools\CallbackTool;
use Astro\Trail\Tests\Fixtures\Tools\LookupTool;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Event;
use Illuminate\Validation\ValidationException;
use Laravel\Ai\Events\AgentFailed;
use Laravel\Ai\Events\AgentPrompted;
use Laravel\Ai\Events\InvokingTool;
use Laravel\Ai\Events\PromptingAgent;
use Laravel\Ai\Events\StartingStep;
use Laravel\Ai\Events\StepFailed;
use Laravel\Ai\Events\ToolFailed;
use Laravel\Ai\Events\ToolInvoked;
use Laravel\Ai\Exceptions\AiException;
use Laravel\Ai\Exceptions\FailoverableException;
use Laravel\Ai\Exceptions\InsufficientCreditsException;
use Laravel\Ai\Exceptions\NoSuchToolException;
use Laravel\Ai\Exceptions\ProviderConnectionException;
use Laravel\Ai\Exceptions\ProviderOverloadedException;
use Laravel\Ai\Exceptions\RateLimitedException;
use Laravel\Ai\Responses\Data\ToolCall;
use Laravel\Ai\Responses\Data\ToolResult;

/*
|--------------------------------------------------------------------------
| How a non-streamed agent run fails
|--------------------------------------------------------------------------
|
| Pins down which events a failing ->prompt() call fires, in what order and
| with what data: provider errors, tool errors, unknown tools, the step
| budget, the exception classes the gateway maps HTTP errors to, and
| listeners that throw. Failover between providers is in FailoverTest.
|
*/

/**
 * A scripted turn that calls a tool.
 */
function failingToolTurn(string $name = 'lookup', string $id = 'toolu_1', array $input = ['query' => 'laravel']): array
{
    return FakeAnthropic::toolUse([['id' => $id, 'name' => $name, 'input' => $input]]);
}

/**
 * Run the callback and return what it throws, failing the test when it does not throw.
 */
function failingThrown(Closure $run): Throwable
{
    try {
        $run();
    } catch (Throwable $exception) {
        return $exception;
    }

    throw new LogicException('Expected the run to throw.');
}

describe('a provider failure on the only provider', function () {
    it('fires StepFailed and then AgentFailed, and never AgentPrompted', function () {
        FakeAnthropic::script([FakeAnthropic::error(500, 'Server error')]);

        failingThrown(fn () => (new AssistantAgent)->prompt('Hi'));

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'StartingStep#0',
            'StepFailed#0',
            'AgentFailed',
        ])->and($this->sdk->of(AgentPrompted::class))->toBe([]);
    });

    it('carries the exception, step number, duration and model on StepFailed', function () {
        FakeAnthropic::script([FakeAnthropic::error(500, 'Server error')]);

        $thrown = failingThrown(fn () => (new AssistantAgent)->prompt('Hi', model: FakeAnthropic::MODEL));

        $failed = $this->sdk->sole(StepFailed::class)->event;

        expect($failed->exception)->toBe($thrown)
            ->and($failed->exception)->toBeInstanceOf(RequestException::class)
            ->and($failed->exception->getMessage())->toStartWith('HTTP request returned status code 500')
            ->and($failed->stepNumber)->toBe(0)
            ->and($failed->isFinalStep)->toBeFalse()
            ->and($failed->model)->toBe(FakeAnthropic::MODEL)
            ->and($failed->provider->name())->toBe('anthropic')
            ->and($failed->agent)->toBeInstanceOf(AssistantAgent::class)
            ->and($failed->invocationId)->toBe($this->sdk->sole(PromptingAgent::class)->invocationId)
            ->and($failed->time)->toBeFloat()->toBeGreaterThan(0.0)->toBeLessThan(5000.0);
    });

    it('gives the agent, provider and requested model on AgentFailed through its prompt', function () {
        FakeAnthropic::script([FakeAnthropic::error(500, 'Server error')]);

        $thrown = failingThrown(fn () => (new AssistantAgent)->prompt('Hi', model: FakeAnthropic::MODEL));

        $failed = $this->sdk->sole(AgentFailed::class)->event;

        expect($failed->exception)->toBe($thrown)
            ->and($failed->invocationId)->toBe($this->sdk->sole(PromptingAgent::class)->invocationId)
            ->and($failed->prompt->agent)->toBeInstanceOf(AssistantAgent::class)
            ->and($failed->prompt->provider->name())->toBe('anthropic')
            ->and($failed->prompt->model)->toBe(FakeAnthropic::MODEL)
            ->and($failed->prompt->prompt)->toBe('Hi')
            ->and($failed->prompt->isFinalAttempt())->toBeTrue()
            // The prompt that failed is the very object the run announced on PromptingAgent.
            ->and($failed->prompt)->toBe($this->sdk->sole(PromptingAgent::class)->event->prompt);
    });

    it('rethrows to the caller the same exception instance that both events carry', function () {
        FakeAnthropic::script([FakeAnthropic::error(500, 'Server error')]);

        $thrown = failingThrown(fn () => (new AssistantAgent)->prompt('Hi'));

        expect($this->sdk->sole(StepFailed::class)->event->exception)->toBe($thrown)
            ->and($this->sdk->sole(AgentFailed::class)->event->exception)->toBe($thrown);
    });

    it('numbers the failed step after the steps that already completed', function () {
        FakeAnthropic::script([failingToolTurn(), FakeAnthropic::error(500, 'Server error')]);

        failingThrown(fn () => (new AssistantAgent([new LookupTool]))->prompt('Hi'));

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'StartingStep#0', 'StepCompleted#0', 'InvokingTool(lookup)', 'ToolInvoked(lookup)',
            'StartingStep#1', 'StepFailed#1',
            'AgentFailed',
        ])->and($this->sdk->sole(StepFailed::class)->event->isFinalStep)->toBeTrue();
    });

    it('treats a connection failure like any other provider failure', function () {
        FakeAnthropic::script([FakeAnthropic::connectionFailure()]);

        $thrown = failingThrown(fn () => (new AssistantAgent)->prompt('Hi'));

        expect($this->sdk->timeline())->toBe(['PromptingAgent', 'StartingStep#0', 'StepFailed#0', 'AgentFailed'])
            ->and($thrown)->toBeInstanceOf(ProviderConnectionException::class)
            ->and($this->sdk->sole(AgentFailed::class)->event->exception)->toBe($thrown);
    });

    it('fires the same events when an SDK fake closure throws in place of the gateway', function () {
        AssistantAgent::fake([fn () => throw new RuntimeException('Fake failed')]);

        $thrown = failingThrown(fn () => (new AssistantAgent)->prompt('Hi'));

        expect($this->sdk->timeline())->toBe(['PromptingAgent', 'StartingStep#0', 'StepFailed#0', 'AgentFailed'])
            ->and($thrown->getMessage())->toBe('Fake failed')
            ->and($this->sdk->sole(StepFailed::class)->event->exception)->toBe($thrown);
    });
});

describe('a provider that answers HTTP 200 with an error body', function () {
    it('fails the step with a plain AiException that is not failoverable', function () {
        FakeAnthropic::script([FakeAnthropic::error(200, 'Something went wrong', 'api_error')]);

        $thrown = failingThrown(fn () => (new AssistantAgent)->prompt('Hi'));

        expect($this->sdk->timeline())->toBe(['PromptingAgent', 'StartingStep#0', 'StepFailed#0', 'AgentFailed'])
            ->and($thrown::class)->toBe(AiException::class)
            ->and($thrown->getMessage())->toBe('Anthropic Error: [api_error] Something went wrong')
            ->and($thrown)->not->toBeInstanceOf(FailoverableException::class)
            ->and($thrown->getPrevious())->toBeNull()
            ->and($this->sdk->sole(AgentFailed::class)->event->exception)->toBe($thrown);
    });
});

describe('exception classes for provider errors', function () {
    // The Anthropic gateway maps 429, 402, 529 and the shared gateway statuses itself, and treats
    // any status whose message contains a billing phrase as insufficient credits. Everything else
    // is rethrown as the HTTP client's RequestException, which is not failoverable.
    dataset('provider errors', [
        '429 rate limited' => [429, 'Slow down', RateLimitedException::class, true, 'Application rate limited by AI provider [anthropic].'],
        '402 payment required' => [402, 'Pay up', InsufficientCreditsException::class, true, 'AI provider [anthropic] has insufficient credits or quota.'],
        '529 overloaded' => [529, 'Overloaded', ProviderOverloadedException::class, true, 'AI provider [anthropic] is overloaded.'],
        '502 bad gateway' => [502, 'Bad gateway', ProviderOverloadedException::class, true, 'AI provider [anthropic] is overloaded.'],
        '503 unavailable' => [503, 'Unavailable', ProviderOverloadedException::class, true, 'AI provider [anthropic] is overloaded.'],
        '504 gateway timeout' => [504, 'Timeout', ProviderOverloadedException::class, true, 'AI provider [anthropic] is overloaded.'],
        '500 server error' => [500, 'Server error', RequestException::class, false, 'HTTP request returned status code 500'],
        '401 unauthorised' => [401, 'Invalid key', RequestException::class, false, 'HTTP request returned status code 401'],
        '400 bad request' => [400, 'Bad request', RequestException::class, false, 'HTTP request returned status code 400'],
        '404 not found' => [404, 'No such model', RequestException::class, false, 'HTTP request returned status code 404'],
        '400 credit balance message' => [400, 'Your credit balance is too low to access the API.', InsufficientCreditsException::class, true, 'AI provider [anthropic] has insufficient credits or quota.'],
        '500 billing message' => [500, 'A billing problem occurred.', InsufficientCreditsException::class, true, 'AI provider [anthropic] has insufficient credits or quota.'],
        // The word "insufficient" alone is enough, so a permissions error is reported as missing credits.
        '403 insufficient permissions message' => [403, 'Insufficient permissions for this model.', InsufficientCreditsException::class, true, 'AI provider [anthropic] has insufficient credits or quota.'],
    ]);

    it('maps the HTTP error to an exception class', function (int $status, string $message, string $class, bool $failoverable, string $expectedMessage) {
        FakeAnthropic::script([FakeAnthropic::error($status, $message)]);

        $thrown = failingThrown(fn () => (new AssistantAgent)->prompt('Hi'));

        $step = $this->sdk->sole(StepFailed::class)->event->exception;
        $terminal = $this->sdk->sole(AgentFailed::class)->event->exception;

        expect($thrown::class)->toBe($class)
            ->and($thrown instanceof FailoverableException)->toBe($failoverable)
            ->and($thrown->getMessage())->toStartWith($expectedMessage)
            ->and($thrown->getCode())->toBe($status)
            ->and($step)->toBe($thrown)
            ->and($terminal)->toBe($thrown);

        // A mapped exception wraps the HTTP client's exception; an unmapped one is that exception.
        if ($thrown instanceof RequestException) {
            expect($thrown->getPrevious())->toBeNull()
                ->and($thrown->response->status())->toBe($status);
        } else {
            expect($thrown->getPrevious())->toBeInstanceOf(RequestException::class)
                ->and($thrown->getPrevious()->response->status())->toBe($status);
        }
    })->with('provider errors');

    it('maps a connection failure to ProviderConnectionException wrapping the HTTP client exception', function () {
        FakeAnthropic::script([FakeAnthropic::connectionFailure()]);

        $thrown = failingThrown(fn () => (new AssistantAgent)->prompt('Hi'));

        expect($thrown::class)->toBe(ProviderConnectionException::class)
            ->and($thrown instanceof FailoverableException)->toBeTrue()
            ->and($thrown->getMessage())->toBe('Could not connect to AI provider [anthropic].')
            ->and($thrown->getPrevious())->toBeInstanceOf(ConnectionException::class);
    });

    it('has four failoverable exception classes among the SDK exceptions', function () {
        $directory = dirname((new ReflectionClass(AiException::class))->getFileName());

        $classes = collect(glob($directory.'/*.php'))
            ->map(fn (string $file) => 'Laravel\\Ai\\Exceptions\\'.basename($file, '.php'))
            ->reject(fn (string $class) => interface_exists($class))
            ->sort()
            ->values();

        expect($classes->all())->toBe([
            'Laravel\Ai\Exceptions\AiException',
            'Laravel\Ai\Exceptions\ApprovalMismatchException',
            'Laravel\Ai\Exceptions\ApprovalNotResumableException',
            'Laravel\Ai\Exceptions\EmbeddingsCountMismatchException',
            'Laravel\Ai\Exceptions\InsufficientCreditsException',
            'Laravel\Ai\Exceptions\NoSuchToolException',
            'Laravel\Ai\Exceptions\ProviderConnectionException',
            'Laravel\Ai\Exceptions\ProviderOverloadedException',
            'Laravel\Ai\Exceptions\RateLimitedException',
            'Laravel\Ai\Exceptions\StreamErrorException',
        ])->and($classes->filter(fn (string $class) => is_subclass_of($class, FailoverableException::class))->values()->all())->toBe([
            'Laravel\Ai\Exceptions\InsufficientCreditsException',
            'Laravel\Ai\Exceptions\ProviderConnectionException',
            'Laravel\Ai\Exceptions\ProviderOverloadedException',
            'Laravel\Ai\Exceptions\RateLimitedException',
        ]);
    });
});

describe('a tool that throws', function () {
    it('fires ToolFailed and then AgentFailed, with no StepFailed', function () {
        FakeAnthropic::script([failingToolTurn('explode', 'toolu_1', ['query' => 'laravel'])]);

        $tool = new CallbackTool('explode', fn () => throw new RuntimeException('Tool broke'));

        $thrown = failingThrown(fn () => (new AssistantAgent([$tool]))->prompt('Hi'));

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'InvokingTool(explode)',
            'ToolFailed(explode)',
            'AgentFailed',
        ])->and($thrown->getMessage())->toBe('Tool broke')
            ->and($this->sdk->sole(AgentFailed::class)->event->exception)->toBe($thrown);
    });

    it('carries the tool, arguments, exception, duration and both invocation ids on ToolFailed', function () {
        FakeAnthropic::script([failingToolTurn('explode', 'toolu_1', ['query' => 'laravel'])]);

        $tool = new CallbackTool('explode', fn () => throw new RuntimeException('Tool broke'));

        $thrown = failingThrown(fn () => (new AssistantAgent([$tool]))->prompt('Hi'));

        $failed = $this->sdk->sole(ToolFailed::class)->event;
        $invoking = $this->sdk->of(InvokingTool::class)[0]->event;

        expect($failed->tool)->toBe($tool)
            ->and($failed->arguments)->toBe(['query' => 'laravel'])
            ->and($failed->exception)->toBe($thrown)
            ->and($failed->time)->toBeFloat()->toBeGreaterThanOrEqual(0.0)->toBeLessThan(5000.0)
            ->and($failed->agent)->toBeInstanceOf(AssistantAgent::class)
            ->and($failed->invocationId)->toBe($this->sdk->sole(PromptingAgent::class)->invocationId)
            ->and(strlen($failed->toolInvocationId))->toBe(36)
            ->and($failed->toolInvocationId)->toBe($invoking->toolInvocationId);
    });

    it('does not fire ToolInvoked for the failed call, and the response is never built', function () {
        FakeAnthropic::script([failingToolTurn('explode')]);

        $tool = new CallbackTool('explode', fn () => throw new RuntimeException('Tool broke'));

        failingThrown(fn () => (new AssistantAgent([$tool]))->prompt('Hi'));

        expect($this->sdk->of(ToolInvoked::class))->toBe([])
            ->and($this->sdk->of(StepFailed::class))->toBe([])
            ->and($this->sdk->of(AgentPrompted::class))->toBe([]);
    });

    it('fails the run on the first throwing tool and skips the tools after it in the same step', function () {
        FakeAnthropic::script([FakeAnthropic::toolUse([
            ['id' => 'toolu_1', 'name' => 'explode', 'input' => []],
            ['id' => 'toolu_2', 'name' => 'lookup', 'input' => ['query' => 'laravel']],
        ])]);

        $tool = new CallbackTool('explode', fn () => throw new RuntimeException('Tool broke'));

        failingThrown(fn () => (new AssistantAgent([$tool, new LookupTool]))->prompt('Hi'));

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'InvokingTool(explode)',
            'ToolFailed(explode)',
            'AgentFailed',
        ]);
    });
});

describe('a tool that fails validation', function () {
    it('answers the model with the error text, fires ToolInvoked and keeps the run going', function () {
        FakeAnthropic::script([failingToolTurn('strict', 'toolu_1', ['query' => '']), FakeAnthropic::text('Fixed')]);

        $tool = new CallbackTool('strict', fn () => throw ValidationException::withMessages([
            'query' => 'The query field is required.',
            'limit' => 'The limit must be a number.',
        ]));

        $response = (new AssistantAgent([$tool]))->prompt('Hi');

        $invoked = $this->sdk->sole(ToolInvoked::class)->event;

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'InvokingTool(strict)',
            'ToolInvoked(strict)',
            'StartingStep#1',
            'StepCompleted#1',
            'AgentPrompted',
        ])->and($invoked->result)->toBe('The query field is required. The limit must be a number.')
            ->and($this->sdk->of(ToolFailed::class))->toBe([])
            ->and($response->text)->toBe('Fixed')
            ->and($response->toolResults)->toHaveCount(1)
            ->and($response->toolResults[0]->result)->toBe('The query field is required. The limit must be a number.')
            ->and($response->toolResults[0]->failed)->toBeFalse();
    });

    it('falls back to the exception message when the validator has no messages', function () {
        FakeAnthropic::script([failingToolTurn('strict'), FakeAnthropic::text('Fixed')]);

        $tool = new CallbackTool('strict', fn () => throw ValidationException::withMessages([]));

        (new AssistantAgent([$tool]))->prompt('Hi');

        expect($this->sdk->sole(ToolInvoked::class)->event->result)->toBe('The given data was invalid.');
    });
});

describe('tool calls that cannot run', function () {
    it('fails the run with NoSuchToolException for an unknown tool on a step that is not final', function () {
        FakeAnthropic::script([failingToolTurn('missing', 'toolu_1', []), FakeAnthropic::text('Never reached')]);

        $thrown = failingThrown(fn () => (new AssistantAgent([new LookupTool]))->prompt('Hi'));

        // No tool event at all: the step completes, then the run dies resolving its tool calls.
        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'AgentFailed',
        ])->and($thrown)->toBeInstanceOf(NoSuchToolException::class)
            ->and($thrown->getMessage())->toBe("Model tried to call unavailable tool 'missing'.")
            ->and($thrown->toolName)->toBe('missing')
            ->and($thrown instanceof FailoverableException)->toBeFalse()
            ->and($this->sdk->sole(AgentFailed::class)->event->exception)->toBe($thrown);
    });

    it('answers an unknown tool on the final step with a failed result and ends the run normally', function () {
        FakeAnthropic::script([failingToolTurn('missing', 'toolu_1', ['x' => 1])]);

        $response = (new FailingSingleStepAgent([new LookupTool]))->prompt('Hi');

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'AgentPrompted',
        ])->and($this->sdk->sole(StartingStep::class)->event->isFinalStep)->toBeTrue()
            ->and($response->toolResults)->toHaveCount(1)
            ->and($response->toolResults[0])->toBeInstanceOf(ToolResult::class)
            ->and($response->toolResults[0]->name)->toBe('missing')
            ->and($response->toolResults[0]->failed)->toBeTrue()
            ->and($response->toolResults[0]->result)->toBe('The agent reached its maximum number of steps without running this tool call.')
            ->and($response->text)->toBe('');
    });

    it('does not run a known tool requested on the final step and marks its result failed', function () {
        FakeAnthropic::script([failingToolTurn('lookup', 'toolu_1', ['query' => 'laravel'])]);

        $response = (new FailingSingleStepAgent([new LookupTool]))->prompt('Hi');

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'AgentPrompted',
        ])->and($response->toolCalls)->toHaveCount(1)
            ->and($response->toolResults)->toHaveCount(1)
            ->and($response->toolResults[0]->name)->toBe('lookup')
            ->and($response->toolResults[0]->failed)->toBeTrue()
            ->and($response->toolResults[0]->result)->toBe('The agent reached its maximum number of steps without running this tool call.');
    });

    it('stops a run that keeps calling tools when the budget runs out on the final step', function () {
        // One tool gives a budget of two steps: step 0 runs the tool, step 1 is final and its call is refused.
        FakeAnthropic::script([failingToolTurn('lookup', 'toolu_1'), failingToolTurn('lookup', 'toolu_2')]);

        $response = (new AssistantAgent([new LookupTool]))->prompt('Hi');

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'StartingStep#0', 'StepCompleted#0', 'InvokingTool(lookup)', 'ToolInvoked(lookup)',
            'StartingStep#1', 'StepCompleted#1',
            'AgentPrompted',
        ])->and(array_map(fn (ToolResult $result) => $result->failed, $response->toolResults->all()))->toBe([false, true]);
    });

    it('answers an unknown tool with a repair message on any step when the agent asks for repairs', function () {
        FakeAnthropic::script([failingToolTurn('missing', 'toolu_1', []), FakeAnthropic::text('Recovered')]);

        $response = (new FailingRepairingAgent([new LookupTool]))->prompt('Hi');

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'StartingStep#0', 'StepCompleted#0',
            'StartingStep#1', 'StepCompleted#1',
            'AgentPrompted',
        ])->and($response->text)->toBe('Recovered')
            ->and($response->toolResults)->toHaveCount(1)
            ->and($response->toolResults[0]->failed)->toBeTrue()
            ->and($response->toolResults[0]->result)->toBe("Tool 'missing' does not exist. Available tools: lookup.");
    });

    it('prefers the repair message over the step budget message for an unknown tool on the final step', function () {
        FakeAnthropic::script([failingToolTurn('missing', 'toolu_1', []), failingToolTurn('absent', 'toolu_2', [])]);

        $response = (new FailingRepairingAgent([new LookupTool]))->prompt('Hi');

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'StartingStep#0', 'StepCompleted#0',
            'StartingStep#1', 'StepCompleted#1',
            'AgentPrompted',
        ])->and(array_map(fn (ToolResult $result) => $result->result, $response->toolResults->all()))->toBe([
            "Tool 'missing' does not exist. Available tools: lookup.",
            "Tool 'absent' does not exist. Available tools: lookup.",
        ]);
    });

    it('still runs a known tool on a repairing agent', function () {
        FakeAnthropic::script([failingToolTurn('lookup', 'toolu_1'), FakeAnthropic::text('Done')]);

        $response = (new FailingRepairingAgent([new LookupTool]))->prompt('Hi');

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'StartingStep#0', 'StepCompleted#0', 'InvokingTool(lookup)', 'ToolInvoked(lookup)',
            'StartingStep#1', 'StepCompleted#1',
            'AgentPrompted',
        ])->and($response->toolResults[0]->failed)->toBeFalse();
    });

    it('fails the run the same way when an SDK fake asks for an unknown tool', function () {
        AssistantAgent::fake([new ToolCall('call_1', 'missing', []), 'Never reached']);

        $thrown = failingThrown(fn () => (new AssistantAgent([new LookupTool]))->prompt('Hi'));

        expect($thrown)->toBeInstanceOf(NoSuchToolException::class)
            ->and($this->sdk->timeline())->toBe(['PromptingAgent', 'StartingStep#0', 'StepCompleted#0', 'AgentFailed']);
    });
});

describe('a listener that throws', function () {
    // The listener is a wildcard registered after the log, so the event it throws on is still recorded.
    dataset('throwing listeners', [
        'PromptingAgent' => ['PromptingAgent', 'tool', ['PromptingAgent', 'AgentFailed'], 0],
        'StartingStep' => ['StartingStep', 'tool', ['PromptingAgent', 'StartingStep#0', 'AgentFailed'], 0],
        'StepCompleted' => ['StepCompleted', 'tool', ['PromptingAgent', 'StartingStep#0', 'StepCompleted#0', 'AgentFailed'], 1],
        'InvokingTool' => ['InvokingTool', 'tool', ['PromptingAgent', 'StartingStep#0', 'StepCompleted#0', 'InvokingTool(lookup)', 'AgentFailed'], 1],
        'ToolInvoked' => ['ToolInvoked', 'tool', ['PromptingAgent', 'StartingStep#0', 'StepCompleted#0', 'InvokingTool(lookup)', 'ToolInvoked(lookup)', 'AgentFailed'], 1],
        'ToolFailed' => ['ToolFailed', 'broken tool', ['PromptingAgent', 'StartingStep#0', 'StepCompleted#0', 'InvokingTool(explode)', 'ToolFailed(explode)', 'AgentFailed'], 1],
        'StepFailed' => ['StepFailed', 'provider error', ['PromptingAgent', 'StartingStep#0', 'StepFailed#0', 'AgentFailed'], 1],
    ]);

    it('fails the run with AgentFailed carrying the listener exception and stops at the event it threw on', function (string $event, string $scenario, array $timeline, int $requests) {
        Event::listen('Laravel\Ai\Events\*', function (string $name, array $payload) use ($event) {
            if (class_basename($payload[0]) === $event) {
                throw new LogicException('Listener on '.$event);
            }
        });

        $anthropic = FakeAnthropic::script(match ($scenario) {
            'provider error' => [FakeAnthropic::error(500, 'Server error')],
            'broken tool' => [failingToolTurn('explode'), FakeAnthropic::text('Done')],
            default => [failingToolTurn('lookup'), FakeAnthropic::text('Done')],
        });

        $tools = [new LookupTool, new CallbackTool('explode', fn () => throw new RuntimeException('Tool broke'))];

        $thrown = failingThrown(fn () => (new AssistantAgent($tools))->prompt('Hi'));

        expect($thrown)->toBeInstanceOf(LogicException::class)
            ->and($thrown->getMessage())->toBe('Listener on '.$event)
            ->and($this->sdk->timeline())->toBe($timeline)
            ->and($this->sdk->sole(AgentFailed::class)->event->exception)->toBe($thrown)
            ->and(count($anthropic->requests()))->toBe($requests);
    })->with('throwing listeners');

    it('replaces the original exception with the one the listener threw', function () {
        FakeAnthropic::script([FakeAnthropic::error(500, 'Server error')]);

        Event::listen('Laravel\Ai\Events\*', function (string $name, array $payload) {
            if ($payload[0] instanceof StepFailed) {
                throw new LogicException('Listener on StepFailed');
            }
        });

        failingThrown(fn () => (new AssistantAgent)->prompt('Hi'));

        // The event the listener threw on still carries the provider's exception.
        expect($this->sdk->sole(StepFailed::class)->event->exception)->toBeInstanceOf(RequestException::class)
            ->and($this->sdk->sole(AgentFailed::class)->event->exception)->toBeInstanceOf(LogicException::class);
    });

    it('breaks the run after it completed when the listener throws on AgentPrompted, and fires no AgentFailed', function () {
        FakeAnthropic::script([FakeAnthropic::text('Done')]);

        Event::listen('Laravel\Ai\Events\*', function (string $name, array $payload) {
            if ($payload[0] instanceof AgentPrompted) {
                throw new LogicException('Listener on AgentPrompted');
            }
        });

        $thrown = failingThrown(fn () => (new AssistantAgent)->prompt('Hi'));

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'AgentPrompted',
        ])->and($thrown->getMessage())->toBe('Listener on AgentPrompted');
    });

    it('replaces the provider exception with the listener exception when the listener throws on AgentFailed', function () {
        FakeAnthropic::script([FakeAnthropic::error(500, 'Server error')]);

        Event::listen('Laravel\Ai\Events\*', function (string $name, array $payload) {
            if ($payload[0] instanceof AgentFailed) {
                throw new LogicException('Listener on AgentFailed');
            }
        });

        $thrown = failingThrown(fn () => (new AssistantAgent)->prompt('Hi'));

        expect($this->sdk->timeline())->toBe(['PromptingAgent', 'StartingStep#0', 'StepFailed#0', 'AgentFailed'])
            ->and($thrown)->toBeInstanceOf(LogicException::class)
            ->and($this->sdk->sole(AgentFailed::class)->event->exception)->toBeInstanceOf(RequestException::class);
    });
});
