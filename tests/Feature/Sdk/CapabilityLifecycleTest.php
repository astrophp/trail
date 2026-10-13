<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Agents\ResearcherAgent;
use Astro\Trail\Tests\Fixtures\Agents\SummarizerAgent;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Sdk\FakeCohere;
use Astro\Trail\Tests\Fixtures\Sdk\FakeDecisions;
use Astro\Trail\Tests\Fixtures\Sdk\ScriptedClassificationGateway;
use Astro\Trail\Tests\Fixtures\Sdk\ScriptedRerankingGateway;
use Astro\Trail\Tests\Fixtures\Tools\CallbackTool;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Laravel\Ai\Ai;
use Laravel\Ai\Classification;
use Laravel\Ai\Classification\Boolean;
use Laravel\Ai\Embeddings;
use Laravel\Ai\Events\AgentFailed;
use Laravel\Ai\Events\AgentPrompted;
use Laravel\Ai\Events\Classified;
use Laravel\Ai\Events\Classifying;
use Laravel\Ai\Events\GeneratingEmbeddings;
use Laravel\Ai\Events\InvokingTool;
use Laravel\Ai\Events\ProviderFailedOver;
use Laravel\Ai\Events\Reranked;
use Laravel\Ai\Events\Reranking as RerankingEvent;
use Laravel\Ai\Events\StartingStep;
use Laravel\Ai\Events\ToolFailed;
use Laravel\Ai\Events\ToolInvoked;
use Laravel\Ai\Exceptions\RateLimitedException;
use Laravel\Ai\Gateway\ParentInvocation;
use Laravel\Ai\Reranking;
use Laravel\Ai\Responses\ClassificationResponse;
use Laravel\Ai\Responses\Data\Meta;
use Laravel\Ai\Responses\Data\RerankingUsage;
use Laravel\Ai\Responses\Data\TextUsage;
use Laravel\Ai\Responses\Data\ToolCall;
use Laravel\Ai\Responses\RerankingResponse;

function sdkCapabilityCall(string $capability, string|array|null $providers = null): ClassificationResponse|RerankingResponse
{
    return $capability === 'classification'
        ? Classification::of('Example')->question('valid', new Boolean('Valid?'))->classify($providers, 'shared-model')
        : Reranking::of(['first', 'second'])->rerank('query', $providers, 'shared-model');
}

function sdkCapabilityEvents(string $capability): array
{
    return $capability === 'classification' ? [Classifying::class, Classified::class] : [RerankingEvent::class, Reranked::class];
}

function sdkCapabilityHttp(string $capability, array $turns): FakeDecisions|FakeCohere
{
    return $capability === 'classification' ? FakeDecisions::script($turns) : FakeCohere::script($turns);
}

function sdkCapabilitySuccess(string $capability): array
{
    return ['body' => $capability === 'classification' ? ['answers' => []] : ['results' => []]];
}

function sdkCapabilityGateway(string $capability, Closure $callback, string $provider = 'openrouter'): void
{
    if ($capability === 'classification') {
        Ai::classificationProvider($provider)->useClassificationGateway(new ScriptedClassificationGateway($callback));
    } else {
        Ai::rerankingProvider($provider)->useRerankingGateway(new ScriptedRerankingGateway($callback));
    }
}

function sdkCapabilityResponse(string $capability): ClassificationResponse|RerankingResponse
{
    return $capability === 'classification'
        ? new ClassificationResponse([], new TextUsage, new Meta('openrouter', 'shared-model'))
        : new RerankingResponse([], new RerankingUsage, new Meta('openrouter', 'shared-model'));
}

dataset('sdk capabilities', ['classification', 'reranking']);

it('starts a fresh UUID7 attempt after HTTP failover and only completes the successful attempt', function (string $capability) {
    $fake = sdkCapabilityHttp($capability, [FakeDecisions::error(429), sdkCapabilitySuccess($capability)]);
    $providers = $capability === 'classification' ? ['typesafe', 'decisions-backup'] : ['cohere', 'rerank-backup'];
    sdkCapabilityCall($capability, $providers);
    [$startClass, $endClass] = sdkCapabilityEvents($capability);
    [$first, $second] = $this->sdk->of($startClass);

    expect($this->sdk->names())->toBe([class_basename($startClass), 'ProviderFailedOver', class_basename($startClass), class_basename($endClass)])
        ->and($first->invocationId)->not->toBe($second->invocationId)
        ->and($this->sdk->sole($endClass)->invocationId)->toBe($second->invocationId)
        ->and($this->sdk->forInvocation($first->invocationId)->names())->toBe([class_basename($startClass)])
        ->and(array_keys(get_object_vars($this->sdk->sole(ProviderFailedOver::class)->event)))->toBe(['provider', 'model', 'exception'])
        ->and($fake->remaining())->toBe(0);
    foreach ([$first, $second] as $entry) {
        expect($entry->invocationId)->toMatch('/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/');
    }
})->with('sdk capabilities');

it('dispatches generic failover even for the final exhausted HTTP attempt', function (string $capability) {
    sdkCapabilityHttp($capability, [FakeDecisions::error(429), FakeDecisions::error(429)]);
    $providers = $capability === 'classification' ? ['typesafe', 'decisions-backup'] : ['cohere', 'rerank-backup'];
    $caught = null;
    try {
        sdkCapabilityCall($capability, $providers);
    } catch (RateLimitedException $exception) {
        $caught = $exception;
    }
    [$startClass, $endClass] = sdkCapabilityEvents($capability);
    $failovers = $this->sdk->of(ProviderFailedOver::class);

    expect($caught)->toBeInstanceOf(RateLimitedException::class)
        ->and($this->sdk->names())->toBe([class_basename($startClass), 'ProviderFailedOver', class_basename($startClass), 'ProviderFailedOver'])
        ->and($this->sdk->invocationIds())->toHaveCount(2)
        ->and($this->sdk->of($endClass))->toBe([])
        ->and($failovers[1]->event->exception)->toBe($caught)
        ->and($failovers[0]->invocationId)->toBeNull()
        ->and($failovers[1]->invocationId)->toBeNull();
})->with('sdk capabilities');

it('emits no terminal or failover for a non-failoverable HTTP error caught by the application', function (string $capability) {
    sdkCapabilityHttp($capability, [FakeDecisions::error(500)]);
    expect(fn () => sdkCapabilityCall($capability))->toThrow(RequestException::class);
    [$startClass] = sdkCapabilityEvents($capability);
    expect($this->sdk->names())->toBe([class_basename($startClass)])
        ->and(ParentInvocation::current())->toBe([null, null]);
})->with('sdk capabilities');

it('attributes real HTTP calls to ordinary and streamed tools', function (string $capability, bool $streamed) {
    sdkCapabilityHttp($capability, [sdkCapabilitySuccess($capability)]);
    FakeAnthropic::script([FakeAnthropic::toolUse([['id' => 'call', 'name' => 'decide']]), FakeAnthropic::text('Done')]);
    $agent = new AssistantAgent([new CallbackTool('decide', function () use ($capability) {
        sdkCapabilityCall($capability);

        return 'Done';
    })]);
    if ($streamed) {
        foreach ($agent->stream('Hi') as $event) {
            // Consume the real stream, including its tool loop.
        }
    } else {
        $agent->prompt('Hi');
    }
    [$startClass, $endClass] = sdkCapabilityEvents($capability);
    $tool = $this->sdk->sole(InvokingTool::class)->event;
    foreach ([$startClass, $endClass] as $class) {
        expect($this->sdk->sole($class)->parentInvocation)->toBe([$tool->invocationId, $tool->toolInvocationId]);
    }
    expect(ParentInvocation::current())->toBe([null, null]);
})->with('sdk capabilities')->with([false, true]);

it('restores ambient context when an uncaught arbitrary capability exception fails a tool and agent', function (string $capability) {
    $failure = new RuntimeException('Arbitrary gateway failure.');
    sdkCapabilityGateway($capability, fn () => throw $failure);
    AssistantAgent::fake([new ToolCall('call', 'decide', []), 'Done']);
    $agent = new AssistantAgent([new CallbackTool('decide', function () use ($capability) {
        sdkCapabilityCall($capability, 'openrouter');

        return 'Unreachable';
    })]);

    expect(fn () => $agent->prompt('Hi'))->toThrow($failure);
    [$startClass] = sdkCapabilityEvents($capability);
    expect($this->sdk->timeline())->toBe(['PromptingAgent', 'StartingStep#0', 'StepCompleted#0', 'InvokingTool(decide)', class_basename($startClass), 'ToolFailed(decide)', 'AgentFailed'])
        ->and($this->sdk->sole(ToolFailed::class)->event->exception)->toBe($failure)
        ->and($this->sdk->sole(AgentFailed::class)->event->exception)->toBe($failure)
        ->and(ParentInvocation::current())->toBe([null, null]);
})->with('sdk capabilities');

it('allows a tool to catch a capability exception and complete without a capability terminal', function (string $capability) {
    sdkCapabilityHttp($capability, [FakeDecisions::error(500)]);
    AssistantAgent::fake([new ToolCall('call', 'decide', []), 'Done']);
    $agent = new AssistantAgent([new CallbackTool('decide', function () use ($capability) {
        try {
            sdkCapabilityCall($capability);
        } catch (RequestException) {
            return 'Caught';
        }

        return 'Unreachable';
    })]);
    $agent->prompt('Hi');
    [, $endClass] = sdkCapabilityEvents($capability);
    expect($this->sdk->of($endClass))->toBe([])
        ->and($this->sdk->of(ToolFailed::class))->toBe([])
        ->and($this->sdk->of(AgentPrompted::class))->toHaveCount(1)
        ->and(ParentInvocation::current())->toBe([null, null]);
})->with('sdk capabilities');

it('keeps outer tool context in delegated callbacks and switches to the deepest tool for actual tool work', function (string $capability) {
    sdkCapabilityHttp($capability, array_fill(0, 5, sdkCapabilitySuccess($capability)));
    AssistantAgent::fake([new ToolCall('outer', 'ResearcherAgent', ['task' => 'Dig']), 'Done']);
    ResearcherAgent::fake([new ToolCall('middle', 'SummarizerAgent', ['task' => 'Summarize']), 'Found']);
    SummarizerAgent::fake([new ToolCall('inner', 'decide', []), 'Summary']);
    Event::listen(StartingStep::class, function (StartingStep $event) use ($capability) {
        if ($event->agent instanceof SummarizerAgent || $event->agent instanceof ResearcherAgent) {
            sdkCapabilityCall($capability);
        }
    });
    $deepest = new SummarizerAgent([new CallbackTool('decide', function () use ($capability) {
        sdkCapabilityCall($capability);

        return 'Done';
    })]);
    (new AssistantAgent([new ResearcherAgent([$deepest])]))->prompt('Hi');
    [$startClass, $endClass] = sdkCapabilityEvents($capability);
    [$outer, $middle, $inner] = $this->sdk->of(InvokingTool::class);
    $contexts = array_map(fn ($entry) => $entry->parentInvocation, $this->sdk->of($startClass));
    expect($contexts)->toBe([
        [$outer->invocationId, $outer->event->toolInvocationId],
        [$middle->invocationId, $middle->event->toolInvocationId],
        [$inner->invocationId, $inner->event->toolInvocationId],
        [$middle->invocationId, $middle->event->toolInvocationId],
        [$outer->invocationId, $outer->event->toolInvocationId],
    ])->and(array_map(fn ($entry) => $entry->parentInvocation, $this->sdk->of($endClass)))->toBe($contexts)
        ->and(ParentInvocation::current())->toBe([null, null]);
})->with('sdk capabilities');

it('restores delegated context when AgentTool catches the deepest capability exception', function (string $capability) {
    $failure = new RuntimeException('Deep gateway failure.');
    sdkCapabilityGateway($capability, fn () => throw $failure);
    AssistantAgent::fake([new ToolCall('outer', 'ResearcherAgent', ['task' => 'Dig']), 'Done']);
    ResearcherAgent::fake([new ToolCall('middle', 'SummarizerAgent', ['task' => 'Summarize']), 'Found']);
    SummarizerAgent::fake([new ToolCall('inner', 'decide', []), 'Summary']);
    $deepest = new SummarizerAgent([new CallbackTool('decide', function () use ($capability) {
        sdkCapabilityCall($capability, 'openrouter');

        return 'Unreachable';
    })]);
    $response = (new AssistantAgent([new ResearcherAgent([$deepest])]))->prompt('Hi');
    [$startClass, $endClass] = sdkCapabilityEvents($capability);
    $inner = $this->sdk->of(InvokingTool::class)[2];
    expect($this->sdk->sole($startClass)->parentInvocation)->toBe([$inner->invocationId, $inner->event->toolInvocationId])
        ->and($this->sdk->of($endClass))->toBe([])
        ->and($this->sdk->sole(ToolFailed::class)->event->exception)->toBe($failure)
        ->and($this->sdk->sole(AgentFailed::class)->event->exception)->toBe($failure)
        ->and($this->sdk->of(ToolInvoked::class)[0]->event->result)->toBe('Agent failed: Deep gateway failure.')
        ->and($this->sdk->of(AgentPrompted::class))->toHaveCount(2)
        ->and($response->text)->toBe('Done')
        ->and(ParentInvocation::current())->toBe([null, null]);
})->with('sdk capabilities');

it('observes SDK context even when Trail suppresses or filters the parent or flushes inside the provider', function (string $capability, string $control) {
    $fake = sdkCapabilityHttp($capability, [function () use ($capability, $control) {
        if ($control === 'flush') {
            Trail::flush();
        }

        return sdkCapabilitySuccess($capability);
    }]);
    AssistantAgent::fake([new ToolCall('call', 'decide', []), 'Done']);
    $agent = new AssistantAgent([new CallbackTool('decide', function () use ($capability) {
        sdkCapabilityCall($capability);

        return 'Done';
    })]);
    if ($control === 'filter') {
        Trail::filter(fn () => false);
    }
    if ($control === 'suppress') {
        Trail::withoutRecording(fn () => $agent->prompt('Hi'));
    } else {
        $agent->prompt('Hi');
    }
    [$startClass, $endClass] = sdkCapabilityEvents($capability);
    $tool = $this->sdk->sole(InvokingTool::class)->event;
    expect($this->sdk->sole($startClass)->parentInvocation)->toBe([$tool->invocationId, $tool->toolInvocationId])
        ->and($this->sdk->sole($endClass)->parentInvocation)->toBe([$tool->invocationId, $tool->toolInvocationId])
        ->and($fake->remaining())->toBe(0);
    // SDK context only: no claim about a future recorder's acceptance of these events.
})->with('sdk capabilities')->with(['suppress', 'filter', 'flush']);

it('carries unknown or already closed ambient parent IDs without validating them', function (string $capability, bool $closed) {
    sdkCapabilityHttp($capability, [sdkCapabilitySuccess($capability)]);
    $parent = 'unknown-parent';
    if ($closed) {
        AssistantAgent::fake(['Done']);
        (new AssistantAgent)->prompt('Hi');
        $parent = $this->sdk->sole(AgentPrompted::class)->invocationId;
    }
    ParentInvocation::within($parent, 'synthetic-tool', fn () => sdkCapabilityCall($capability));
    [$startClass, $endClass] = sdkCapabilityEvents($capability);
    expect($this->sdk->sole($startClass)->parentInvocation)->toBe([$parent, 'synthetic-tool'])
        ->and($this->sdk->sole($endClass)->parentInvocation)->toBe([$parent, 'synthetic-tool'])
        ->and(ParentInvocation::current())->toBe([null, null]);
})->with('sdk capabilities')->with([false, true]);

it('matches reentrant same-model completions by ID rather than start or completion order', function (string $capability) {
    $depth = 0;
    sdkCapabilityGateway($capability, function () use ($capability, &$depth) {
        if ($depth++ === 0) {
            sdkCapabilityCall($capability, 'openrouter');
        }

        return sdkCapabilityResponse($capability);
    });
    sdkCapabilityCall($capability, 'openrouter');
    [$startClass, $endClass] = sdkCapabilityEvents($capability);
    [$outer, $inner] = $this->sdk->of($startClass);
    [$innerEnd, $outerEnd] = $this->sdk->of($endClass);
    expect($this->sdk->names())->toBe([class_basename($startClass), class_basename($startClass), class_basename($endClass), class_basename($endClass)])
        ->and($innerEnd->invocationId)->toBe($inner->invocationId)
        ->and($outerEnd->invocationId)->toBe($outer->invocationId)
        ->and($outer->invocationId)->not->toBe($inner->invocationId);
})->with('sdk capabilities');

it('cannot identify the failed capability from generic failover beside an open embedding of the same provider and model', function (string $capability, bool $interleaved) {
    $provider = Ai::embeddingProvider('openrouter');
    $depth = 0;
    sdkCapabilityGateway($capability, function () use ($capability, $interleaved, &$depth) {
        if ($interleaved && $depth++ === 0) {
            sdkCapabilityCall($capability, 'openrouter');
        }
        throw RateLimitedException::forProvider('openrouter');
    });
    Http::fake(['openrouter.ai/api/v1/embeddings' => function () use ($capability) {
        expect(fn () => sdkCapabilityCall($capability, 'openrouter'))->toThrow(RateLimitedException::class);

        return Http::response(['data' => [['embedding' => [0.1, 0.2, 0.3]]], 'usage' => ['prompt_tokens' => 7]]);
    }]);
    $response = Embeddings::for(['document'])->dimensions(3)->generate('openrouter', 'shared-model');
    $prompt = $this->sdk->sole(GeneratingEmbeddings::class)->event->prompt;
    [$startClass, $endClass] = sdkCapabilityEvents($capability);
    expect($response->embeddings)->toBe([[0.1, 0.2, 0.3]])
        ->and($this->sdk->names())->toBe($interleaved
            ? ['GeneratingEmbeddings', class_basename($startClass), class_basename($startClass), 'ProviderFailedOver', 'ProviderFailedOver', 'EmbeddingsGenerated']
            : ['GeneratingEmbeddings', class_basename($startClass), 'ProviderFailedOver', 'EmbeddingsGenerated']);
    expect($this->sdk->of($startClass))->toHaveCount($interleaved ? 2 : 1)
        ->and($this->sdk->of($endClass))->toBe([]);
    foreach ($this->sdk->of(ProviderFailedOver::class) as $entry) {
        expect(array_keys(get_object_vars($entry->event)))->toBe(['provider', 'model', 'exception'])
            ->and($entry->event->provider->driver())->toBe($provider->driver())
            ->and($entry->event->model)->toBe($prompt->model)
            ->and($entry->invocationId)->toBeNull();
    }
})->with('sdk capabilities')->with([false, true]);

it('labels duplicate late and unknown terminal events as synthetic observer inputs', function (string $capability) {
    sdkCapabilityHttp($capability, [sdkCapabilitySuccess($capability)]);
    sdkCapabilityCall($capability);
    [, $endClass] = sdkCapabilityEvents($capability);
    $terminal = $this->sdk->sole($endClass)->event;
    Trail::flush();
    Event::dispatch(clone $terminal);
    $unknown = clone $terminal;
    $unknown->invocationId = 'unknown-invocation';
    Event::dispatch($unknown);
    expect($this->sdk->of($endClass))->toHaveCount(3)
        ->and($this->sdk->of($endClass)[1]->invocationId)->toBe($terminal->invocationId)
        ->and($this->sdk->of($endClass)[2]->invocationId)->toBe('unknown-invocation');
})->with('sdk capabilities');
