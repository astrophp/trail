<?php

use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Tools\CallbackTool;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Event;
use Laravel\Ai\Events\AgentFailed;
use Laravel\Ai\Events\AgentFailedOver;
use Laravel\Ai\Events\AgentPrompted;
use Laravel\Ai\Events\PromptingAgent;
use Laravel\Ai\Events\ProviderFailedOver;
use Laravel\Ai\Events\StartingStep;
use Laravel\Ai\Events\StepFailed;
use Laravel\Ai\Events\ToolFailed;
use Laravel\Ai\Events\ToolInvoked;
use Laravel\Ai\Exceptions\ProviderConnectionException;
use Laravel\Ai\Exceptions\ProviderOverloadedException;
use Laravel\Ai\Exceptions\RateLimitedException;

/*
|--------------------------------------------------------------------------
| Failover between providers
|--------------------------------------------------------------------------
|
| An agent prompted with several providers runs once per provider until one
| succeeds. Pins down what a failed attempt fires, what the next attempt
| repeats, which failures move on to the next provider and which end the
| run, and what a listener can use to tell the attempts apart.
|
*/

/**
 * Both providers answer through the faked Anthropic API, so a failing script entry is what makes
 * the first provider fail and the next entry is what the second provider answers.
 */
function failoverProviders(): array
{
    return ['anthropic' => 'model-a', 'backup' => 'model-b'];
}

/**
 * Run the callback and return what it throws, failing the test when it does not throw.
 */
function failoverThrown(Closure $run): Throwable
{
    try {
        $run();
    } catch (Throwable $exception) {
        return $exception;
    }

    throw new LogicException('Expected the run to throw.');
}

describe('a failoverable failure with a second provider', function () {
    beforeEach(function () {
        $this->anthropic = FakeAnthropic::script([FakeAnthropic::error(429, 'Slow down'), FakeAnthropic::text('ok')]);

        $this->response = (new AssistantAgent)->prompt('Hi', provider: failoverProviders());
    });

    it('fires AgentFailedOver instead of AgentFailed and repeats the run events for the next provider', function () {
        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'StartingStep#0',
            'StepFailed#0',
            'AgentFailedOver',
            'PromptingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'AgentPrompted',
        ])->and($this->sdk->of(AgentFailed::class))->toBe([])
            ->and($this->response->text)->toBe('ok');
    });

    it('keeps one invocation id across the attempts', function () {
        expect($this->sdk->invocationIds())->toBe([$this->response->invocationId])
            ->and($this->sdk->of(PromptingAgent::class))->toHaveCount(2);
    });

    it('still fires StepFailed for the failed attempt, carrying the failoverable exception', function () {
        $failed = $this->sdk->sole(StepFailed::class)->event;

        expect($failed->stepNumber)->toBe(0)
            ->and($failed->exception)->toBeInstanceOf(RateLimitedException::class)
            ->and($failed->provider->name())->toBe('anthropic')
            ->and($failed->model)->toBe('model-a')
            ->and($failed->time)->toBeFloat();
    });

    it('carries the invocation id, agent, provider, model and exception on AgentFailedOver', function () {
        $failover = $this->sdk->sole(AgentFailedOver::class)->event;

        expect($failover->invocationId)->toBe($this->response->invocationId)
            ->and($failover->agent)->toBeInstanceOf(AssistantAgent::class)
            ->and($failover->provider->name())->toBe('anthropic')
            ->and($failover->model)->toBe('model-a')
            ->and($failover->exception)->toBeInstanceOf(RateLimitedException::class)
            ->and($failover->exception->getMessage())->toBe('Application rate limited by AI provider [anthropic].')
            ->and($failover->exception->getPrevious())->toBeInstanceOf(RequestException::class)
            // It names the provider that failed, not the one the run moves on to, and is the exception StepFailed carried.
            ->and($failover->exception)->toBe($this->sdk->sole(StepFailed::class)->event->exception);
    });

    it('names the provider and model each attempt used on its repeated events', function () {
        $names = fn (string $class) => array_map(
            fn ($entry) => $entry->event->provider->name().'/'.$entry->event->model,
            $this->sdk->of($class),
        );

        expect($names(StartingStep::class))->toBe(['anthropic/model-a', 'backup/model-b'])
            ->and(array_map(fn ($entry) => $entry->event->prompt->provider->name().'/'.$entry->event->prompt->model, $this->sdk->of(PromptingAgent::class)))
            ->toBe(['anthropic/model-a', 'backup/model-b'])
            ->and($this->sdk->sole(AgentPrompted::class)->event->prompt->provider->name())->toBe('backup')
            ->and($this->anthropic->urls())->toBe([
                'https://api.anthropic.com/v1/messages',
                'https://backup.anthropic.test/v1/messages',
            ]);
    });

    it('restarts step numbers at zero for the next attempt', function () {
        expect(array_map(fn ($entry) => $entry->event->stepNumber, $this->sdk->of(StartingStep::class)))->toBe([0, 0]);
    });

    it('reports the provider and model that answered in the response meta', function () {
        expect($this->response->meta->provider)->toBe('backup')
            ->and($this->response->meta->model)->toBe('model-b');
    });

    it('lets a listener tell the attempts apart by the prompt on PromptingAgent', function () {
        [$first, $second] = array_map(fn ($entry) => $entry->event->prompt, $this->sdk->of(PromptingAgent::class));

        // No attempt number exists: isFinalAttempt() is the only flag, and each attempt builds its own prompt.
        expect($first)->not->toBe($second)
            ->and($first->isFinalAttempt())->toBeFalse()
            ->and($second->isFinalAttempt())->toBeTrue()
            ->and($first->invocationId)->toBe($second->invocationId)
            ->and($first->agent)->toBe($second->agent)
            ->and($this->sdk->sole(AgentPrompted::class)->event->prompt)->toBe($second);
    });

    it('does not deliver AgentFailedOver to a listener of its parent class ProviderFailedOver', function () {
        $parent = [];
        $own = [];

        Event::listen(ProviderFailedOver::class, function (ProviderFailedOver $event) use (&$parent) {
            $parent[] = $event;
        });
        Event::listen(AgentFailedOver::class, function (AgentFailedOver $event) use (&$own) {
            $own[] = $event;
        });

        FakeAnthropic::script([FakeAnthropic::error(429), FakeAnthropic::text('ok')]);

        (new AssistantAgent)->prompt('Hi', provider: failoverProviders());

        expect($parent)->toBe([])
            ->and($own)->toHaveCount(1)
            ->and($own[0])->toBeInstanceOf(ProviderFailedOver::class);
    });

    it('builds the final response from the successful attempt only', function () {
        expect($this->response->steps)->toHaveCount(1)
            ->and($this->response->usage->inputTokens)->toBe(10)
            ->and($this->response->usage->outputTokens)->toBe(5);
    });
});

describe('which failures move to the next provider', function () {
    it('fails over on an overloaded provider', function () {
        FakeAnthropic::script([FakeAnthropic::error(529, 'Overloaded'), FakeAnthropic::text('ok')]);

        (new AssistantAgent)->prompt('Hi', provider: failoverProviders());

        expect($this->sdk->sole(AgentFailedOver::class)->event->exception)->toBeInstanceOf(ProviderOverloadedException::class);
    });

    it('fails over on a connection failure', function () {
        FakeAnthropic::script([FakeAnthropic::connectionFailure(), FakeAnthropic::text('ok')]);

        (new AssistantAgent)->prompt('Hi', provider: failoverProviders());

        expect($this->sdk->sole(AgentFailedOver::class)->event->exception)->toBeInstanceOf(ProviderConnectionException::class);
    });

    it('fails over when an SDK fake throws a failoverable exception', function () {
        // A fake entry that throws is not consumed, so a list of fakes would throw again on the next provider; one closure can answer by provider.
        AssistantAgent::fake(fn ($prompt, $attachments, $provider, $model) => $provider->name() === 'anthropic'
            ? throw RateLimitedException::forProvider('anthropic')
            : 'answered by '.$provider->name().' with '.$model);

        $response = (new AssistantAgent)->prompt('Hi', provider: failoverProviders());

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent', 'StartingStep#0', 'StepFailed#0', 'AgentFailedOver',
            'PromptingAgent', 'StartingStep#0', 'StepCompleted#0', 'AgentPrompted',
        ])->and($response->text)->toBe('answered by backup with model-b');
    });

    it('ends the run at once on a failure that is not failoverable, without trying the second provider', function () {
        $anthropic = FakeAnthropic::script([FakeAnthropic::error(500, 'Server error'), FakeAnthropic::text('ok')]);

        $thrown = failoverThrown(fn () => (new AssistantAgent)->prompt('Hi', provider: failoverProviders()));

        expect($this->sdk->timeline())->toBe(['PromptingAgent', 'StartingStep#0', 'StepFailed#0', 'AgentFailed'])
            ->and($thrown)->toBeInstanceOf(RequestException::class)
            ->and($this->sdk->sole(AgentFailed::class)->event->exception)->toBe($thrown)
            ->and($this->sdk->sole(AgentFailed::class)->event->prompt->isFinalAttempt())->toBeFalse()
            ->and($anthropic->urls())->toBe(['https://api.anthropic.com/v1/messages'])
            ->and($anthropic->remaining())->toBe(1);
    });

    it('ends the run at once on an unauthorised key', function () {
        $anthropic = FakeAnthropic::script([FakeAnthropic::error(401, 'Invalid key'), FakeAnthropic::text('ok')]);

        failoverThrown(fn () => (new AssistantAgent)->prompt('Hi', provider: failoverProviders()));

        expect($this->sdk->timeline())->toBe(['PromptingAgent', 'StartingStep#0', 'StepFailed#0', 'AgentFailed'])
            ->and($anthropic->remaining())->toBe(1);
    });

    it('ends the run at once on a plain exception thrown by an SDK fake', function () {
        $providersCalled = [];

        AssistantAgent::fake(function ($prompt, $attachments, $provider) use (&$providersCalled) {
            $providersCalled[] = $provider->name();

            throw new RuntimeException('Plain failure');
        });

        $thrown = failoverThrown(fn () => (new AssistantAgent)->prompt('Hi', provider: failoverProviders()));

        expect($this->sdk->timeline())->toBe(['PromptingAgent', 'StartingStep#0', 'StepFailed#0', 'AgentFailed'])
            ->and($thrown->getMessage())->toBe('Plain failure')
            ->and($providersCalled)->toBe(['anthropic']);
    });

    it('ends the run with AgentFailed when the second provider fails with something not failoverable', function () {
        FakeAnthropic::script([FakeAnthropic::error(429), FakeAnthropic::error(500, 'Server error')]);

        $thrown = failoverThrown(fn () => (new AssistantAgent)->prompt('Hi', provider: failoverProviders()));

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent', 'StartingStep#0', 'StepFailed#0', 'AgentFailedOver',
            'PromptingAgent', 'StartingStep#0', 'StepFailed#0', 'AgentFailed',
        ])->and($thrown)->toBeInstanceOf(RequestException::class)
            ->and($this->sdk->sole(AgentFailed::class)->event->prompt->provider->name())->toBe('backup');
    });
});

describe('several providers', function () {
    beforeEach(function () {
        config(['ai.providers.third' => ['driver' => 'anthropic', 'key' => 'test-key', 'url' => 'https://backup.anthropic.test/v1']]);

        $this->providers = ['anthropic' => 'model-a', 'backup' => 'model-b', 'third' => 'model-c'];
    });

    it('fails over once per failed provider and succeeds on the third', function () {
        FakeAnthropic::script([FakeAnthropic::error(429), FakeAnthropic::error(503), FakeAnthropic::text('ok')]);

        $response = (new AssistantAgent)->prompt('Hi', provider: $this->providers);

        $failovers = array_map(fn ($entry) => $entry->event, $this->sdk->of(AgentFailedOver::class));

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent', 'StartingStep#0', 'StepFailed#0', 'AgentFailedOver',
            'PromptingAgent', 'StartingStep#0', 'StepFailed#0', 'AgentFailedOver',
            'PromptingAgent', 'StartingStep#0', 'StepCompleted#0', 'AgentPrompted',
        ])->and(array_map(fn ($event) => $event->provider->name().'/'.$event->model.'/'.$event->exception::class, $failovers))->toBe([
            'anthropic/model-a/'.RateLimitedException::class,
            'backup/model-b/'.ProviderOverloadedException::class,
        ])->and($this->sdk->invocationIds())->toBe([$response->invocationId])
            ->and($response->meta->provider)->toBe('third')
            ->and($response->meta->model)->toBe('model-c')
            ->and(array_map(fn ($entry) => $entry->event->prompt->isFinalAttempt(), $this->sdk->of(PromptingAgent::class)))->toBe([false, false, true]);
    });

    it('fires AgentFailed once, for the last provider, when every provider fails', function () {
        FakeAnthropic::script([FakeAnthropic::error(429, 'first'), FakeAnthropic::error(503, 'second'), FakeAnthropic::error(429, 'third')]);

        $thrown = failoverThrown(fn () => (new AssistantAgent)->prompt('Hi', provider: $this->providers));

        $failed = $this->sdk->sole(AgentFailed::class)->event;

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent', 'StartingStep#0', 'StepFailed#0', 'AgentFailedOver',
            'PromptingAgent', 'StartingStep#0', 'StepFailed#0', 'AgentFailedOver',
            'PromptingAgent', 'StartingStep#0', 'StepFailed#0', 'AgentFailed',
        ])->and($thrown)->toBeInstanceOf(RateLimitedException::class)
            ->and($thrown->getMessage())->toBe('Application rate limited by AI provider [third].')
            ->and($failed->exception)->toBe($thrown)
            ->and($failed->prompt->provider->name())->toBe('third')
            ->and($failed->prompt->model)->toBe('model-c')
            ->and($failed->prompt->isFinalAttempt())->toBeTrue()
            ->and($this->sdk->of(AgentPrompted::class))->toBe([]);
    });

    it('fires AgentFailed once, for the only provider, when no second provider is configured', function () {
        FakeAnthropic::script([FakeAnthropic::error(429)]);

        $thrown = failoverThrown(fn () => (new AssistantAgent)->prompt('Hi'));

        expect($this->sdk->timeline())->toBe(['PromptingAgent', 'StartingStep#0', 'StepFailed#0', 'AgentFailed'])
            ->and($this->sdk->sole(AgentFailed::class)->event->exception)->toBe($thrown)
            ->and($thrown)->toBeInstanceOf(RateLimitedException::class);
    });
});

describe('a failover after tools already ran', function () {
    it('starts the next attempt from scratch and runs the tool again', function () {
        $calls = 0;
        $tool = new CallbackTool('lookup', function () use (&$calls) {
            return 'call '.++$calls;
        });

        $anthropic = FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'laravel']]]),
            FakeAnthropic::error(429),
            FakeAnthropic::toolUse([['id' => 'toolu_2', 'name' => 'lookup', 'input' => ['query' => 'laravel']]]),
            FakeAnthropic::text('ok'),
        ]);

        $response = (new AssistantAgent([$tool]))->prompt('Hi', provider: failoverProviders());

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'StartingStep#0', 'StepCompleted#0', 'InvokingTool(lookup)', 'ToolInvoked(lookup)',
            'StartingStep#1', 'StepFailed#1',
            'AgentFailedOver',
            'PromptingAgent',
            'StartingStep#0', 'StepCompleted#0', 'InvokingTool(lookup)', 'ToolInvoked(lookup)',
            'StartingStep#1', 'StepCompleted#1',
            'AgentPrompted',
        ])->and($calls)->toBe(2)
            // The second attempt's first request carries only the prompt, none of the first attempt's tool exchange.
            ->and($anthropic->requests()[2]['messages'])->toHaveCount(1)
            ->and($response->steps)->toHaveCount(2)
            ->and($response->toolResults)->toHaveCount(1)
            ->and($response->toolResults[0]->id)->toBe('toolu_2')
            ->and($response->toolResults[0]->result)->toBe('call 2');
    });

    it('gives the two ToolInvoked events of the repeated tool different tool invocation ids', function () {
        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'lookup', 'input' => ['query' => 'laravel']]]),
            FakeAnthropic::error(429),
            FakeAnthropic::toolUse([['id' => 'toolu_2', 'name' => 'lookup', 'input' => ['query' => 'laravel']]]),
            FakeAnthropic::text('ok'),
        ]);

        (new AssistantAgent([new CallbackTool('lookup', fn () => 'result')]))->prompt('Hi', provider: failoverProviders());

        [$first, $second] = array_map(fn ($entry) => $entry->event->toolInvocationId, $this->sdk->of(ToolInvoked::class));

        expect($first)->not->toBe($second);
    });
});

describe('a tool that throws with a second provider configured', function () {
    it('ends the run at once when the tool throws an ordinary exception', function () {
        $anthropic = FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'explode', 'input' => []]]),
            FakeAnthropic::text('never used'),
        ]);

        $tool = new CallbackTool('explode', fn () => throw new RuntimeException('Tool broke'));

        $thrown = failoverThrown(fn () => (new AssistantAgent([$tool]))->prompt('Hi', provider: failoverProviders()));

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent', 'StartingStep#0', 'StepCompleted#0', 'InvokingTool(explode)', 'ToolFailed(explode)', 'AgentFailed',
        ])->and($thrown->getMessage())->toBe('Tool broke')
            ->and($anthropic->remaining())->toBe(1);
    });

    it('fails over when the tool throws a failoverable exception, and the tool runs again on the next provider', function () {
        $calls = 0;
        $tool = new CallbackTool('explode', function () use (&$calls) {
            $calls++;

            throw RateLimitedException::forProvider('some-api');
        });

        FakeAnthropic::script([
            FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'explode', 'input' => []]]),
            FakeAnthropic::toolUse([['id' => 'toolu_2', 'name' => 'explode', 'input' => []]]),
        ]);

        $thrown = failoverThrown(fn () => (new AssistantAgent([$tool]))->prompt('Hi', provider: failoverProviders()));

        // The tool's exception is treated like a provider failure: AgentFailedOver on the first attempt, AgentFailed on the last.
        expect($this->sdk->timeline())->toBe([
            'PromptingAgent', 'StartingStep#0', 'StepCompleted#0', 'InvokingTool(explode)', 'ToolFailed(explode)',
            'AgentFailedOver',
            'PromptingAgent', 'StartingStep#0', 'StepCompleted#0', 'InvokingTool(explode)', 'ToolFailed(explode)',
            'AgentFailed',
        ])->and($calls)->toBe(2)
            ->and($thrown->getMessage())->toBe('Application rate limited by AI provider [some-api].')
            ->and($this->sdk->sole(AgentFailed::class)->event->exception)->toBe($thrown)
            ->and($this->sdk->sole(AgentFailedOver::class)->event->exception)->toBe($this->sdk->of(ToolFailed::class)[0]->event->exception)
            ->and($this->sdk->of(StepFailed::class))->toBe([]);
    });

    it('lets the second provider answer when the tool fails over once and then works', function () {
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

        $response = (new AssistantAgent([$tool]))->prompt('Hi', provider: failoverProviders());

        expect($response->text)->toBe('ok')
            ->and($response->meta->provider)->toBe('backup')
            ->and($this->sdk->of(AgentFailed::class))->toBe([]);
    });
});

describe('a listener that throws during failover', function () {
    it('aborts the failover when the listener throws on AgentFailedOver, with no AgentFailed', function () {
        $anthropic = FakeAnthropic::script([FakeAnthropic::error(429), FakeAnthropic::text('ok')]);

        Event::listen('Laravel\Ai\Events\*', function (string $name, array $payload) {
            if ($payload[0] instanceof AgentFailedOver) {
                throw new LogicException('Listener on AgentFailedOver');
            }
        });

        $thrown = failoverThrown(fn () => (new AssistantAgent)->prompt('Hi', provider: failoverProviders()));

        expect($thrown->getMessage())->toBe('Listener on AgentFailedOver')
            ->and($this->sdk->timeline())->toBe(['PromptingAgent', 'StartingStep#0', 'StepFailed#0', 'AgentFailedOver'])
            ->and($anthropic->remaining())->toBe(1);
    });
});
