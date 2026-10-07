<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Agents\FailingRepairingAgent;
use Astro\Trail\Tests\Fixtures\Agents\FailingSingleStepAgent;
use Astro\Trail\Tests\Fixtures\Capture\Captured;
use Astro\Trail\Tests\Fixtures\Capture\Failures;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Tools\CallbackTool;
use Astro\Trail\Tests\Fixtures\Tools\LookupTool;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Event;
use Illuminate\Validation\ValidationException;
use Laravel\Ai\Events\StepFailed;
use Laravel\Ai\Exceptions\AiException;
use Laravel\Ai\Exceptions\InsufficientCreditsException;
use Laravel\Ai\Exceptions\NoSuchToolException;
use Laravel\Ai\Exceptions\ProviderConnectionException;
use Laravel\Ai\Exceptions\ProviderOverloadedException;
use Laravel\Ai\Exceptions\RateLimitedException;

/*
|--------------------------------------------------------------------------
| How failed runs are stored
|--------------------------------------------------------------------------
|
| The run's status comes from its terminal agent event only. Step and tool
| failures are stored on the step and tool spans that failed.
|
*/

beforeEach(function () {
    /** Flush and read back the one run this test made. */
    $this->stored = function (): Captured {
        Trail::flush();

        return Captured::read($this->sdk->invocationIds()[0]);
    };

    $this->rateLimited = Captured::failure('rate_limited', RateLimitedException::class, 'Application rate limited by AI provider [anthropic].', 'step', 429);
});

function toolTurn(string $name = 'lookup', string $id = 'toolu_1', array $input = ['query' => 'laravel'], array $usage = []): array
{
    return FakeAnthropic::toolUse([['id' => $id, 'name' => $name, 'input' => $input]], usage: $usage);
}

it('stores a failure on the only provider as a failed trace, agent span and step', function () {
    FakeAnthropic::script([FakeAnthropic::error(429, 'Slow down')]);

    $thrown = Failures::thrown(fn () => (new AssistantAgent)->prompt('Hi', model: FakeAnthropic::MODEL));
    $run = ($this->stored)()->assertVolatileColumns();

    expect($thrown)->toBeInstanceOf(RateLimitedException::class)
        ->and(Captured::pick([$run->trace()], Failures::TRACE)[0])->toBe(Failures::trace('failed', false, 2, $this->rateLimited))
        ->and(Captured::pick($run->spans(), Failures::SPAN))->toBe([
            Failures::span('agent', 1, null, 'failed', $this->rateLimited),
            Failures::span('step', 1, 0, 'failed', $this->rateLimited),
        ])
        ->and($run->trace()['provider'])->toBe('anthropic')
        ->and($run->trace()['model'])->toBe(FakeAnthropic::MODEL);
});

it('keeps the steps and tools that ran before a later step failed, with their usage and cost', function () {
    config(['trail.pricing.anthropic' => [FakeAnthropic::MODEL => ['input' => 3.0, 'output' => 15.0]]]);
    FakeAnthropic::script([toolTurn(usage: ['input_tokens' => 100, 'output_tokens' => 20]), FakeAnthropic::error(429, 'Slow down')]);

    Failures::thrown(fn () => (new AssistantAgent([new LookupTool]))->prompt('Hi', model: FakeAnthropic::MODEL));
    $run = ($this->stored)()->assertVolatileColumns();

    expect(Captured::pick([$run->trace()], Failures::TRACE)[0])->toBe(Failures::trace('failed', false, 4, $this->rateLimited, [
        'input_tokens' => 100, 'output_tokens' => 20, 'cost' => '0.0006000000',
    ]))->and(Captured::pick($run->spans(), Failures::SPAN))->toBe([
        Failures::span('agent', 1, null, 'failed', $this->rateLimited),
        Failures::span('step', 1, 0, 'completed', [], ['input_tokens' => 100, 'output_tokens' => 20, 'cost' => '0.0006000000']),
        Failures::span('tool', 1, null, 'completed'),
        Failures::span('step', 1, 1, 'failed', $this->rateLimited),
    ]);
});

it('stores a tool that throws as a failed tool span, with the run failed from the tool', function () {
    FakeAnthropic::script([FakeAnthropic::toolUse([
        ['id' => 'toolu_1', 'name' => 'explode', 'input' => []],
        ['id' => 'toolu_2', 'name' => 'lookup', 'input' => ['query' => 'laravel']],
    ])]);

    $tool = new CallbackTool('explode', fn () => throw new RuntimeException('Tool broke'));

    Failures::thrown(fn () => (new AssistantAgent([$tool, new LookupTool]))->prompt('Hi', model: FakeAnthropic::MODEL));
    $run = ($this->stored)()->assertVolatileColumns();

    $failure = Captured::failure('tool_error', RuntimeException::class, 'Tool broke', 'tool');

    // The second tool call of the step never started, so it has no span.
    expect(Captured::pick([$run->trace()], Failures::TRACE)[0])->toBe(Failures::trace('failed', false, 3, $failure, [
        'input_tokens' => 10, 'output_tokens' => 5, 'unpriced_span_count' => 1,
    ]))->and(Captured::pick($run->spans(), Failures::SPAN))->toBe([
        Failures::span('agent', 1, null, 'failed', $failure),
        Failures::span('step', 1, 0, 'completed', [], ['input_tokens' => 10, 'output_tokens' => 5]),
        Failures::span('tool', 1, null, 'failed', $failure),
    ])->and($run->spans()[2]['name'])->toBe('explode');
});

it('does not treat a tool validation error as a failure', function () {
    FakeAnthropic::script([toolTurn('strict', input: ['query' => '']), FakeAnthropic::text('Fixed')]);

    $tool = new CallbackTool('strict', fn () => throw ValidationException::withMessages(['query' => 'The query field is required.']));

    (new AssistantAgent([$tool]))->prompt('Hi', model: FakeAnthropic::MODEL);
    $run = ($this->stored)()->assertVolatileColumns();

    expect(Captured::pick([$run->trace()], Failures::TRACE)[0])->toBe(Failures::trace('completed', false, 4, [], [
        'input_tokens' => 20, 'output_tokens' => 10, 'unpriced_span_count' => 2,
    ]))->and(Captured::pick($run->spans(), Failures::SPAN))->toBe([
        Failures::span('agent', 1, null, 'completed'),
        Failures::span('step', 1, 0, 'completed', [], ['input_tokens' => 10, 'output_tokens' => 5]),
        Failures::span('tool', 1, null, 'completed'),
        Failures::span('step', 1, 1, 'completed', [], ['input_tokens' => 10, 'output_tokens' => 5]),
    ])->and($run->spans()[2]['output'])->toBe(['result' => 'The query field is required.']);
});

describe('an unknown tool', function () {
    it('fails the run from the run itself on a step that is not final, with no tool span', function () {
        FakeAnthropic::script([toolTurn('missing', input: []), FakeAnthropic::text('Never reached')]);

        $thrown = Failures::thrown(fn () => (new AssistantAgent([new LookupTool]))->prompt('Hi', model: FakeAnthropic::MODEL));
        $run = ($this->stored)()->assertVolatileColumns();

        $failure = Captured::failure('exception', NoSuchToolException::class, "Model tried to call unavailable tool 'missing'.", 'run');

        expect($thrown)->toBeInstanceOf(NoSuchToolException::class)
            ->and(Captured::pick([$run->trace()], Failures::TRACE)[0])->toBe(Failures::trace('failed', false, 2, $failure, [
                'input_tokens' => 10, 'output_tokens' => 5, 'unpriced_span_count' => 1,
            ]))->and(Captured::pick($run->spans(), Failures::SPAN))->toBe([
                Failures::span('agent', 1, null, 'failed', $failure),
                Failures::span('step', 1, 0, 'completed', [], ['input_tokens' => 10, 'output_tokens' => 5]),
            ]);
    });

    it('completes the run on the final step or for a repairing agent', function (string $agent, array $turns) {
        FakeAnthropic::script($turns);

        (new $agent([new LookupTool]))->prompt('Hi', model: FakeAnthropic::MODEL);
        $run = ($this->stored)()->assertVolatileColumns();

        expect($run->trace()['status'])->toBe('completed')
            ->and(array_column($run->spans(), 'type'))->not->toContain('tool')
            ->and(array_column($run->spans(), 'issue_kind'))->each->toBeNull();
    })->with([
        'the final step' => [FailingSingleStepAgent::class, [toolTurn('missing', input: [])]],
        'a repairing agent' => [FailingRepairingAgent::class, [toolTurn('missing', input: []), FakeAnthropic::text('Recovered')]],
    ]);
});

describe('a span that is still open when the run fails', function () {
    // Trail listens by event class, and the dispatcher runs those before wildcard listeners, so
    // Trail has already opened the span when the test's wildcard listener throws. The span being
    // stored at all is the proof it was open.
    it('is closed as failed from the run, never left running', function (string $event, int $position, array $statuses) {
        Event::listen('Laravel\Ai\Events\*', function (string $name, array $payload) use ($event) {
            if (class_basename($payload[0]) === $event) {
                throw new LogicException('Listener on '.$event);
            }
        });

        FakeAnthropic::script([toolTurn(), FakeAnthropic::text('Done')]);

        $thrown = Failures::thrown(fn () => (new AssistantAgent([new LookupTool]))->prompt('Hi', model: FakeAnthropic::MODEL));
        $run = ($this->stored)()->assertVolatileColumns(untimed: [$position]);

        $failure = Captured::failure('exception', LogicException::class, 'Listener on '.$event, 'run');
        $columns = array_keys($failure);

        $expected = array_map(
            fn (string $status) => ['status' => $status] + ($status === 'failed' ? $failure : Captured::noFailure()),
            $statuses,
        );

        expect($thrown->getMessage())->toBe('Listener on '.$event)
            ->and(Captured::pick([$run->trace()], ['status', ...$columns])[0])->toBe(['status' => 'failed'] + $failure)
            ->and(Captured::pick($run->spans(), ['status', ...$columns]))->toBe($expected);
    })->with([
        'a tool left open' => ['InvokingTool', 2, ['failed', 'completed', 'failed']],
        'a step left open' => ['StartingStep', 1, ['failed', 'failed']],
    ]);
});

describe('what each kind of provider error is stored as', function () {
    dataset('provider errors', [
        '429' => [429, 'Slow down', 'rate_limited', RateLimitedException::class, 429],
        '402' => [402, 'Pay up', 'insufficient_credits', InsufficientCreditsException::class, 402],
        '529' => [529, 'Overloaded', 'provider_overloaded', ProviderOverloadedException::class, 529],
        '502' => [502, 'Bad gateway', 'provider_overloaded', ProviderOverloadedException::class, 502],
        '503' => [503, 'Unavailable', 'provider_overloaded', ProviderOverloadedException::class, 503],
        '504' => [504, 'Timeout', 'provider_overloaded', ProviderOverloadedException::class, 504],
        '403 with an insufficient permissions message' => [403, 'Insufficient permissions for this model.', 'insufficient_credits', InsufficientCreditsException::class, 403],
        '400 with a credit balance message' => [400, 'Your credit balance is too low to access the API.', 'insufficient_credits', InsufficientCreditsException::class, 400],
        '500' => [500, 'Server error', 'exception', RequestException::class, 500],
        '401' => [401, 'Invalid key', 'exception', RequestException::class, 401],
        '400' => [400, 'Bad request', 'exception', RequestException::class, 400],
        '404' => [404, 'No such model', 'exception', RequestException::class, 404],
    ]);

    it('keeps the kind and the HTTP status on the step and the trace', function (int $status, string $message, string $kind, string $class, int $expectedStatus) {
        FakeAnthropic::script([FakeAnthropic::error($status, $message)]);

        $thrown = Failures::thrown(fn () => (new AssistantAgent)->prompt('Hi', model: FakeAnthropic::MODEL));
        $run = ($this->stored)();

        $expected = ['issue_kind' => $kind, 'error_class' => $class, 'error_message' => $thrown->getMessage(), 'error_source' => 'step', 'error_http_status' => $expectedStatus];
        $columns = ['issue_kind', 'error_class', 'error_message', 'error_source', 'error_http_status'];

        expect($thrown::class)->toBe($class)
            ->and(Captured::pick([$run->spans()[1]], $columns)[0])->toBe($expected)
            ->and(Captured::pick([$run->trace()], $columns)[0])->toBe($expected);
    })->with('provider errors');

    it('stores a connection failure with no HTTP status', function () {
        FakeAnthropic::script([FakeAnthropic::connectionFailure()]);

        Failures::thrown(fn () => (new AssistantAgent)->prompt('Hi', model: FakeAnthropic::MODEL));
        $run = ($this->stored)();

        $expected = Captured::failure('provider_connection', ProviderConnectionException::class, 'Could not connect to AI provider [anthropic].', 'step', null);

        expect(Captured::pick([$run->spans()[1]], array_keys($expected))[0])->toBe($expected)
            ->and(Captured::pick([$run->trace()], array_keys($expected))[0])->toBe($expected);
    });

    it('stores an HTTP 200 error body as a plain exception with no HTTP status', function () {
        FakeAnthropic::script([FakeAnthropic::error(200, 'Something went wrong', 'api_error')]);

        Failures::thrown(fn () => (new AssistantAgent)->prompt('Hi', model: FakeAnthropic::MODEL));
        $run = ($this->stored)();

        $expected = Captured::failure('exception', AiException::class, 'Anthropic Error: [api_error] Something went wrong', 'step', null);

        expect(Captured::pick([$run->spans()[1]], array_keys($expected))[0])->toBe($expected)
            ->and(Captured::pick([$run->trace()], array_keys($expected))[0])->toBe($expected);
    });
});

it('attributes the run\'s error to the run when it is not the exception a step or tool failed with', function () {
    // The listener's exception replaces the provider's, so the step keeps the provider error and the run ends with another.
    Event::listen('Laravel\Ai\Events\*', function (string $name, array $payload) {
        if ($payload[0] instanceof StepFailed) {
            throw new LogicException('Listener on StepFailed');
        }
    });

    FakeAnthropic::script([FakeAnthropic::error(429, 'Slow down')]);

    Failures::thrown(fn () => (new AssistantAgent)->prompt('Hi', model: FakeAnthropic::MODEL));
    $run = ($this->stored)()->assertVolatileColumns();

    $listener = Captured::failure('exception', LogicException::class, 'Listener on StepFailed', 'run');
    $columns = array_keys($listener);

    expect(Captured::pick([$run->trace()], $columns)[0])->toBe($listener)
        ->and(Captured::pick($run->spans(), $columns))->toBe([$listener, $this->rateLimited]);
});
