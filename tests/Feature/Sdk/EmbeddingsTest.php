<?php

use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Tools\CallbackTool;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Laravel\Ai\AiServiceProvider;
use Laravel\Ai\Embeddings;
use Laravel\Ai\Events\AgentFailed;
use Laravel\Ai\Events\EmbeddingsGenerated;
use Laravel\Ai\Events\GeneratingEmbeddings;
use Laravel\Ai\Events\InvokingTool;
use Laravel\Ai\Events\ProviderFailedOver;
use Laravel\Ai\Events\ToolFailed;
use Laravel\Ai\Events\ToolInvoked;
use Laravel\Ai\Exceptions\RateLimitedException;
use Laravel\Ai\Gateway\ParentInvocation;
use Laravel\Ai\Jobs\GenerateEmbeddings;
use Laravel\Ai\Providers\OpenAiProvider;
use Laravel\Ai\Responses\Data\ToolCall;

/*
|--------------------------------------------------------------------------
| Embeddings generated standalone and during an agent run
|--------------------------------------------------------------------------
|
| Pins down the two events an embeddings call fires, what they carry,
| which run (if any) a call made inside a tool belongs to, and what a
| listener sees when the provider fails. Happy paths use the SDK's
| embeddings fake; usage and meta parsing are asserted against the real
| OpenAI gateway with its HTTP faked.
|
*/

describe('standalone embeddings', function () {
    it('fires a generating and a generated event outside any run', function () {
        Embeddings::fake([[[0.1, 0.2]]]);

        $response = Embeddings::for(['hello'])->generate();

        expect($this->sdk->timeline())->toBe(['GeneratingEmbeddings', 'EmbeddingsGenerated'])
            ->and($response->embeddings)->toBe([[0.1, 0.2]])
            ->and(array_map(fn ($entry) => $entry->parentInvocation, $this->sdk->all()))->toBe([[null, null], [null, null]])
            ->and(ParentInvocation::current())->toBe([null, null]);
    });

    it('gives both events the same invocation id and no parent id property', function () {
        Embeddings::fake([[[0.1, 0.2]]]);

        Embeddings::for(['hello'])->generate();

        $generating = $this->sdk->sole(GeneratingEmbeddings::class);
        $generated = $this->sdk->sole(EmbeddingsGenerated::class);

        expect($generating->invocationId)->toBeString()->not->toBeEmpty()
            ->and($generated->invocationId)->toBe($generating->invocationId)
            ->and(array_keys(get_object_vars($generating->event)))->toBe(['invocationId', 'provider', 'model', 'prompt'])
            ->and(array_keys(get_object_vars($generated->event)))->toBe(['invocationId', 'provider', 'model', 'prompt', 'response']);
    });

    it('gives every call its own invocation id', function () {
        Embeddings::fake([[[0.1, 0.2]], [[0.3, 0.4]]]);

        Embeddings::for(['one'])->generate();
        Embeddings::for(['two'])->generate();

        expect($this->sdk->timeline())->toBe([
            'GeneratingEmbeddings', 'EmbeddingsGenerated', 'GeneratingEmbeddings', 'EmbeddingsGenerated',
        ])->and($this->sdk->invocationIds())->toHaveCount(2);
    });

    it('carries the provider, the model and the prompt inputs on both events', function () {
        Embeddings::fake([[[0.1, 0.2], [0.3, 0.4]]]);

        Embeddings::for(['first', 'second'])->dimensions(256)->timeout(5)->generate();

        foreach ([GeneratingEmbeddings::class, EmbeddingsGenerated::class] as $class) {
            $event = $this->sdk->sole($class)->event;

            expect($event->provider)->toBeInstanceOf(OpenAiProvider::class)
                ->and($event->model)->toBe('text-embedding-3-small')
                ->and($event->prompt->inputs)->toBe(['first', 'second'])
                ->and($event->prompt->dimensions)->toBe(256)
                ->and($event->prompt->model)->toBe('text-embedding-3-small')
                ->and($event->prompt->timeout)->toBe(5);
        }
    });

    it('reports zero usage for the faked response', function () {
        Embeddings::fake([[[0.1, 0.2]]]);

        Embeddings::for(['hello'])->generate();

        $response = $this->sdk->sole(EmbeddingsGenerated::class)->event->response;

        expect($response->usage->inputTokens)->toBe(0)
            ->and($response->usage->outputTokens)->toBe(0)
            ->and($response->meta->provider)->toBe('openai')
            ->and($response->meta->model)->toBe('text-embedding-3-small');
    });
});

describe('the real OpenAI gateway', function () {
    it('parses embeddings, usage and meta from the HTTP response', function () {
        Http::fake(['api.openai.com/*' => Http::response([
            'data' => [['embedding' => [0.1, 0.2]], ['embedding' => [0.3, 0.4]]],
            'usage' => ['prompt_tokens' => 7, 'total_tokens' => 7],
            'model' => 'text-embedding-3-small-2024',
        ])]);

        $returned = Embeddings::for(['a', 'b'])->generate();

        $generated = $this->sdk->sole(EmbeddingsGenerated::class)->event;

        expect($this->sdk->timeline())->toBe(['GeneratingEmbeddings', 'EmbeddingsGenerated'])
            ->and($generated->response)->toBe($returned)
            ->and($generated->response->embeddings)->toBe([[0.1, 0.2], [0.3, 0.4]])
            ->and($generated->response->usage->toArray())->toBe(['input_tokens' => 7, 'output_tokens' => 0])
            // Meta holds the model that was requested, not the "model" the API echoed back...
            ->and($generated->response->meta->toArray())->toBe([
                'provider' => 'openai',
                'model' => 'text-embedding-3-small',
                'citations' => [],
            ]);

        Http::assertSent(fn ($request) => $request->url() === 'https://api.openai.com/v1/embeddings'
            && $request->data() === ['model' => 'text-embedding-3-small', 'input' => ['a', 'b'], 'dimensions' => 1536]);
    });

    it('reports zero usage, not null, when the response has no usage block', function () {
        Http::fake(['api.openai.com/*' => Http::response(['data' => [['embedding' => [0.1, 0.2]]]])]);

        Embeddings::for(['a'])->generate();

        expect($this->sdk->sole(EmbeddingsGenerated::class)->event->response->usage->toArray())
            ->toBe(['input_tokens' => 0, 'output_tokens' => 0]);
    });
});

describe('embeddings generated inside a tool', function () {
    it('dispatches both events inside the enclosing run and tool call', function () {
        Embeddings::fake([[[0.1, 0.2]]]);
        AssistantAgent::fake([new ToolCall('call_1', 'embed', ['query' => 'x']), 'Done']);

        $tool = new CallbackTool('embed', fn () => (string) count(Embeddings::for(['hello'])->generate()));

        (new AssistantAgent([$tool]))->prompt('Hi');

        expect($this->sdk->timeline())->toBe([
            'PromptingAgent',
            'StartingStep#0',
            'StepCompleted#0',
            'InvokingTool(embed)',
            'GeneratingEmbeddings',
            'EmbeddingsGenerated',
            'ToolInvoked(embed)',
            'StartingStep#1',
            'StepCompleted#1',
            'AgentPrompted',
        ]);

        [$runId] = $this->sdk->invocationIds();
        $toolId = $this->sdk->sole(InvokingTool::class)->event->toolInvocationId;
        $generating = $this->sdk->sole(GeneratingEmbeddings::class);
        $generated = $this->sdk->sole(EmbeddingsGenerated::class);

        expect($generating->parentInvocation)->toBe([$runId, $toolId])
            ->and($generated->parentInvocation)->toBe([$runId, $toolId])
            ->and($generating->invocationId)->not->toBe($runId)
            ->and($generating->invocationId)->not->toBe($toolId)
            ->and($generated->invocationId)->toBe($generating->invocationId)
            ->and($this->sdk->sole(ToolInvoked::class)->event->result)->toBe('1')
            ->and(ParentInvocation::current())->toBe([null, null]);
    });

    it('dispatches both events inside the tool call when the parent run is streamed', function () {
        Embeddings::fake([[[0.1, 0.2]]]);
        AssistantAgent::fake([new ToolCall('call_1', 'embed', ['query' => 'x']), 'Done']);

        $tool = new CallbackTool('embed', fn () => (string) count(Embeddings::for(['hello'])->generate()));

        $stream = (new AssistantAgent([$tool]))->stream('Hi');
        foreach ($stream as $event) {
            //
        }

        [$runId] = $this->sdk->invocationIds();
        $toolId = $this->sdk->sole(InvokingTool::class)->event->toolInvocationId;

        expect($this->sdk->sole(GeneratingEmbeddings::class)->parentInvocation)->toBe([$runId, $toolId])
            ->and($this->sdk->sole(EmbeddingsGenerated::class)->parentInvocation)->toBe([$runId, $toolId]);
    });

    it('dispatches events outside any run once the tool call has ended', function () {
        Embeddings::fake([[[0.1, 0.2]], [[0.3, 0.4]]]);
        AssistantAgent::fake([new ToolCall('call_1', 'embed', ['query' => 'x']), 'Done']);

        $tool = new CallbackTool('embed', fn () => (string) count(Embeddings::for(['inside'])->generate()));

        (new AssistantAgent([$tool]))->prompt('Hi');
        $this->sdk->clear();

        Embeddings::for(['after'])->generate();

        expect(array_map(fn ($entry) => $entry->parentInvocation, $this->sdk->all()))->toBe([[null, null], [null, null]]);
    });
});

describe('embeddings failures', function () {
    it('has no failure event: the SDK only defines a generating and a generated one', function () {
        $directory = dirname((new ReflectionClass(AiServiceProvider::class))->getFileName()).'/Events';

        $embeddingEvents = collect(glob($directory.'/*.php'))
            ->map(fn (string $path) => basename($path, '.php'))
            ->filter(fn (string $name) => str_contains($name, 'Embedding'))
            ->values()
            ->all();

        expect($embeddingEvents)->toBe(['EmbeddingsGenerated', 'GeneratingEmbeddings']);
    });

    it('fires only the generating event when the provider answers with a server error', function () {
        Http::fake(['api.openai.com/*' => Http::response(['error' => ['message' => 'bad']], 500)]);

        $caught = null;

        try {
            Embeddings::for(['a'])->generate();
        } catch (Throwable $exception) {
            $caught = $exception;
        }

        expect($caught)->toBeInstanceOf(RequestException::class)
            ->and($caught->response->status())->toBe(500)
            ->and($this->sdk->timeline())->toBe(['GeneratingEmbeddings']);
    });

    it('fires the generating event and then a failover event when the provider rate limits, even with one provider', function () {
        Http::fake(['api.openai.com/*' => Http::response(['error' => ['message' => 'slow down']], 429)]);

        $caught = null;

        try {
            Embeddings::for(['a'])->generate();
        } catch (Throwable $exception) {
            $caught = $exception;
        }

        expect($caught)->toBeInstanceOf(RateLimitedException::class)
            ->and($this->sdk->timeline())->toBe(['GeneratingEmbeddings', 'ProviderFailedOver']);

        $failedOver = $this->sdk->sole(ProviderFailedOver::class)->event;

        // The failover event has no invocation id, so it cannot be tied back to the generating event...
        expect($this->sdk->sole(ProviderFailedOver::class)->invocationId)->toBeNull()
            ->and($failedOver->exception)->toBe($caught)
            ->and($failedOver->model)->toBe('text-embedding-3-small');
    });

    it('fails the tool call and the run when embeddings fail inside a tool', function () {
        Http::fake(['api.openai.com/*' => Http::response(['error' => ['message' => 'bad']], 500)]);
        AssistantAgent::fake([new ToolCall('call_1', 'embed', ['query' => 'x']), 'Done']);

        $tool = new CallbackTool('embed', fn () => (string) count(Embeddings::for(['hello'])->generate()));

        $caught = null;

        try {
            (new AssistantAgent([$tool]))->prompt('Hi');
        } catch (Throwable $exception) {
            $caught = $exception;
        }

        expect($caught)->toBeInstanceOf(RequestException::class)
            ->and($this->sdk->timeline())->toBe([
                'PromptingAgent',
                'StartingStep#0',
                'StepCompleted#0',
                'InvokingTool(embed)',
                'GeneratingEmbeddings',
                'ToolFailed(embed)',
                'AgentFailed',
            ]);

        [$runId] = $this->sdk->invocationIds();
        $toolId = $this->sdk->sole(InvokingTool::class)->event->toolInvocationId;

        expect($this->sdk->sole(GeneratingEmbeddings::class)->parentInvocation)->toBe([$runId, $toolId])
            ->and($this->sdk->sole(ToolFailed::class)->event->exception)->toBe($caught)
            ->and($this->sdk->sole(AgentFailed::class)->event->exception)->toBe($caught)
            ->and($this->sdk->sole(AgentFailed::class)->invocationId)->toBe($runId);
    });
});

describe('embeddings entry points that skip the events', function () {
    it('fires no events for a response served from the embeddings cache', function () {
        config(['ai.caching.embeddings.cache' => true, 'ai.caching.embeddings.store' => 'array']);
        Http::fake(['api.openai.com/*' => Http::response([
            'data' => [['embedding' => [0.1, 0.2]]],
            'usage' => ['prompt_tokens' => 7],
        ])]);

        $first = Embeddings::for(['a'])->generate();
        $second = Embeddings::for(['a'])->generate();

        expect($this->sdk->timeline())->toBe(['GeneratingEmbeddings', 'EmbeddingsGenerated'])
            ->and($second->embeddings)->toBe($first->embeddings)
            // A cached response carries empty usage, not the usage of the call that filled the cache...
            ->and($second->usage->toArray())->toBe(['input_tokens' => 0, 'output_tokens' => 0]);

        Http::assertSentCount(1);
    });

    it('fires the events when a queued generation is run by its job, and not when it is queued', function () {
        Queue::fake();
        Embeddings::fake([[[0.1, 0.2]]]);

        Embeddings::for(['a'])->queue();

        expect($this->sdk->timeline())->toBe([]);

        Queue::assertPushed(GenerateEmbeddings::class, function (GenerateEmbeddings $job) {
            $job->handle();

            return true;
        });

        expect($this->sdk->timeline())->toBe(['GeneratingEmbeddings', 'EmbeddingsGenerated'])
            ->and($this->sdk->sole(GeneratingEmbeddings::class)->parentInvocation)->toBe([null, null]);
    });
});
