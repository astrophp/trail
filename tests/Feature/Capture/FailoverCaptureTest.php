<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Capture\Captured;
use Astro\Trail\Tests\Fixtures\Capture\Failures;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Storage\DatabaseStoreProbe;
use Astro\Trail\Tests\Fixtures\Tools\CallbackTool;
use Astro\Trail\Tests\Fixtures\Tools\LookupTool;
use Laravel\Ai\Exceptions\ProviderConnectionException;
use Laravel\Ai\Exceptions\ProviderOverloadedException;
use Laravel\Ai\Exceptions\RateLimitedException;

/*
|--------------------------------------------------------------------------
| How a run that fails over between providers is stored
|--------------------------------------------------------------------------
|
| One trace and one agent span for the whole run; each attempt's error stays on
| the step or tool span that failed. Both configured providers use the Anthropic
| driver, so the stored provider is "anthropic" and the model tells them apart.
|
*/

beforeEach(function () {
    $this->providers = ['anthropic' => 'model-a', 'backup' => 'model-b'];

    $this->stored = function (): Captured {
        Trail::flush();

        return Captured::read($this->sdk->invocationIds()[0]);
    };

    $this->limited = fn (string $message = 'Application rate limited by AI provider [anthropic].') => Captured::failure('rate_limited', RateLimitedException::class, $message, 'step', 429);
});

it('stores a recovered run as completed and recovered, with the failed attempt kept on its step', function () {
    FakeAnthropic::script([FakeAnthropic::error(429, 'Slow down'), FakeAnthropic::text('ok')]);

    (new AssistantAgent)->prompt('Hi', provider: $this->providers);
    $run = ($this->stored)()->assertVolatileColumns();

    expect(Captured::pick([$run->trace()], [...Failures::TRACE, 'provider', 'model'])[0])->toBe(
        Failures::trace('completed', true, 3, [], ['input_tokens' => 10, 'output_tokens' => 5, 'unpriced_span_count' => 1]) + ['provider' => 'anthropic', 'model' => 'model-b'],
    )->and(Captured::pick($run->spans(), [...Failures::SPAN, 'model']))->toBe([
        Failures::span('agent', 2, null, 'completed', [], ['model' => 'model-b']),
        Failures::span('step', 1, 0, 'failed', ($this->limited)(), ['model' => 'model-a']),
        Failures::span('step', 2, 0, 'completed', [], ['input_tokens' => 10, 'output_tokens' => 5, 'model' => 'model-b']),
    ]);
});

it('counts the usage and cost of the failed attempt, and keeps its tool as a separate span', function () {
    config(['trail.pricing.anthropic' => [
        'model-a' => ['input' => 3.0, 'output' => 15.0],
        'model-b' => ['input' => 4.0, 'output' => 20.0],
    ]]);

    FakeAnthropic::script([
        FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'a']]], usage: ['input_tokens' => 100, 'output_tokens' => 20]),
        FakeAnthropic::error(429, 'Slow down'),
        FakeAnthropic::toolUse([['id' => 'toolu_2', 'name' => 'lookup', 'input' => ['query' => 'a']]], usage: ['input_tokens' => 50, 'output_tokens' => 10]),
        FakeAnthropic::text('ok', usage: ['input_tokens' => 30, 'output_tokens' => 5]),
    ]);

    (new AssistantAgent([new LookupTool]))->prompt('Hi', provider: $this->providers);
    $run = ($this->stored)()->assertVolatileColumns();
    $spans = $run->spans();

    // Attempt 1: 100 x 3 + 20 x 15. Attempt 2: 50 x 4 + 10 x 20, then 30 x 4 + 5 x 20 (per million tokens).
    expect(Captured::pick([$run->trace()], Failures::TRACE)[0])->toBe(Failures::trace('completed', true, 7, [], [
        'input_tokens' => 180, 'output_tokens' => 35, 'cost' => '0.0012200000',
    ]))->and(Captured::pick($spans, Failures::SPAN))->toBe([
        Failures::span('agent', 2, null, 'completed'),
        Failures::span('step', 1, 0, 'completed', [], ['input_tokens' => 100, 'output_tokens' => 20, 'cost' => '0.0006000000']),
        Failures::span('tool', 1, null, 'completed'),
        Failures::span('step', 1, 1, 'failed', ($this->limited)()),
        Failures::span('step', 2, 0, 'completed', [], ['input_tokens' => 50, 'output_tokens' => 10, 'cost' => '0.0004000000']),
        Failures::span('tool', 2, null, 'completed'),
        Failures::span('step', 2, 1, 'completed', [], ['input_tokens' => 30, 'output_tokens' => 5, 'cost' => '0.0002200000']),
    ])->and($run->spanId(2))->not->toBe($run->spanId(5));
});

describe('when every provider fails', function () {
    it('stores one failed trace for two providers, with the last error', function () {
        FakeAnthropic::script([FakeAnthropic::error(429, 'first'), FakeAnthropic::error(503, 'second')]);

        Failures::thrown(fn () => (new AssistantAgent)->prompt('Hi', provider: $this->providers));
        $run = ($this->stored)()->assertVolatileColumns();

        $overloaded = Captured::failure('provider_overloaded', ProviderOverloadedException::class, 'AI provider [backup] is overloaded.', 'step', 503);

        expect((new DatabaseStoreProbe)->traceCount())->toBe(1)
            ->and(Captured::pick([$run->trace()], Failures::TRACE)[0])->toBe(Failures::trace('failed', false, 3, $overloaded))
            ->and(Captured::pick($run->spans(), Failures::SPAN))->toBe([
                Failures::span('agent', 2, null, 'failed', $overloaded),
                Failures::span('step', 1, 0, 'failed', ($this->limited)()),
                Failures::span('step', 2, 0, 'failed', $overloaded),
            ]);
    });

    it('stores the attempt count and each attempt\'s own error for three providers', function () {
        config(['ai.providers.third' => ['driver' => 'anthropic', 'key' => 'test-key', 'url' => 'https://backup.anthropic.test/v1']]);
        FakeAnthropic::script([FakeAnthropic::error(429), FakeAnthropic::error(503), FakeAnthropic::connectionFailure()]);

        Failures::thrown(fn () => (new AssistantAgent)->prompt('Hi', provider: $this->providers + ['third' => 'model-c']));
        $run = ($this->stored)()->assertVolatileColumns();

        $connection = Captured::failure('provider_connection', ProviderConnectionException::class, 'Could not connect to AI provider [third].', 'step', null);

        expect(Captured::pick([$run->trace()], Failures::TRACE)[0])->toBe(Failures::trace('failed', false, 4, $connection))
            ->and(Captured::pick($run->spans(), Failures::SPAN))->toBe([
                Failures::span('agent', 3, null, 'failed', $connection),
                Failures::span('step', 1, 0, 'failed', ($this->limited)()),
                Failures::span('step', 2, 0, 'failed', Captured::failure('provider_overloaded', ProviderOverloadedException::class, 'AI provider [backup] is overloaded.', 'step', 503)),
                Failures::span('step', 3, 0, 'failed', $connection),
            ]);
    });
});

it('ends at the first attempt on a failure that is not failoverable, without calling the second provider', function (int $status) {
    $anthropic = FakeAnthropic::script([FakeAnthropic::error($status, 'Nope'), FakeAnthropic::text('ok')]);

    Failures::thrown(fn () => (new AssistantAgent)->prompt('Hi', provider: $this->providers));
    $run = ($this->stored)()->assertVolatileColumns();

    expect(count($anthropic->requests()))->toBe(1)
        ->and($run->trace()['status'])->toBe('failed')
        ->and($run->trace()['recovered'])->toBeFalse()
        ->and($run->trace()['error_http_status'])->toBe($status)
        ->and(Captured::pick($run->spans(), ['type', 'attempt', 'status', 'error_source', 'error_http_status']))->toBe([
            ['type' => 'agent', 'attempt' => 1, 'status' => 'failed', 'error_source' => 'step', 'error_http_status' => $status],
            ['type' => 'step', 'attempt' => 1, 'status' => 'failed', 'error_source' => 'step', 'error_http_status' => $status],
        ]);
})->with([400, 401]);

describe('a tool that throws a failoverable exception', function () {
    it('fails the tool span, runs the tool again on the next attempt and recovers', function () {
        $calls = 0;
        $tool = new CallbackTool('flaky', function () use (&$calls) {
            if (++$calls === 1) {
                throw RateLimitedException::forProvider('some-api');
            }

            return 'fine';
        });

        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'flaky', 'input' => []]]),
            FakeAnthropic::toolUse([['id' => 'toolu_2', 'name' => 'flaky', 'input' => []]]),
            FakeAnthropic::text('ok'),
        ]);

        (new AssistantAgent([$tool]))->prompt('Hi', provider: $this->providers);
        $run = ($this->stored)()->assertVolatileColumns();

        $failure = Captured::failure('rate_limited', RateLimitedException::class, 'Application rate limited by AI provider [some-api].', 'tool', null);

        expect(Captured::pick([$run->trace()], Failures::TRACE)[0])->toBe(Failures::trace('completed', true, 6, [], [
            'input_tokens' => 30, 'output_tokens' => 15, 'unpriced_span_count' => 3,
        ]))->and(Captured::pick($run->spans(), Failures::SPAN))->toBe([
            Failures::span('agent', 2, null, 'completed'),
            Failures::span('step', 1, 0, 'completed', [], ['input_tokens' => 10, 'output_tokens' => 5]),
            Failures::span('tool', 1, null, 'failed', $failure),
            Failures::span('step', 2, 0, 'completed', [], ['input_tokens' => 10, 'output_tokens' => 5]),
            Failures::span('tool', 2, null, 'completed'),
            Failures::span('step', 2, 1, 'completed', [], ['input_tokens' => 10, 'output_tokens' => 5]),
        ]);
    });
});

it('leaves the trace running while a failed attempt is followed by another, since only the terminal event ends a run', function () {
    $calls = 0;
    $tool = new CallbackTool('flaky', function () use (&$calls) {
        if (++$calls === 1) {
            throw RateLimitedException::forProvider('some-api');
        }

        // The second attempt is in flight: the first attempt's tool already failed.
        Trail::flush();

        return 'fine';
    });

    FakeAnthropic::script([
        FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'flaky', 'input' => []]]),
        FakeAnthropic::toolUse([['id' => 'toolu_2', 'name' => 'flaky', 'input' => []]]),
        FakeAnthropic::text('ok'),
    ]);

    (new AssistantAgent([$tool]))->prompt('Hi', provider: $this->providers);
    $run = Captured::read($this->sdk->invocationIds()[0]);

    $failure = Captured::failure('rate_limited', RateLimitedException::class, 'Application rate limited by AI provider [some-api].', 'tool', null);

    expect(Captured::pick([$run->trace()], Failures::TRACE)[0]['status'])->toBe('running')
        ->and(Captured::pick([$run->trace()], Failures::TRACE)[0]['recovered'])->toBeFalse()
        ->and(Captured::pick($run->spans(), ['type', 'attempt', 'status']))->toBe([
            ['type' => 'agent', 'attempt' => 2, 'status' => 'running'],
            ['type' => 'step', 'attempt' => 1, 'status' => 'completed'],
            ['type' => 'tool', 'attempt' => 1, 'status' => 'failed'],
            ['type' => 'step', 'attempt' => 2, 'status' => 'completed'],
            ['type' => 'tool', 'attempt' => 2, 'status' => 'running'],
        ])->and(Captured::pick([$run->spans()[2]], array_keys($failure))[0])->toBe($failure);
});
