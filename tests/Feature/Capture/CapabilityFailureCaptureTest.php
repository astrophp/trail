<?php

use Astro\Trail\Facades\Trail;
use Astro\Trail\Storage\Models\Span;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Sdk\EventLog;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Sdk\FakeCohere;
use Astro\Trail\Tests\Fixtures\Sdk\FakeDecisions;
use Astro\Trail\Tests\Fixtures\Tools\CallbackTool;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Event;
use Laravel\Ai\Classification;
use Laravel\Ai\Classification\Boolean;
use Laravel\Ai\Events\Classified;
use Laravel\Ai\Events\Classifying;
use Laravel\Ai\Events\Reranking as RerankingEvent;
use Laravel\Ai\Exceptions\RateLimitedException;
use Laravel\Ai\Reranking;
use Laravel\Ai\Responses\ClassificationResponse;
use Laravel\Ai\Responses\Data\Meta;
use Laravel\Ai\Responses\Data\TextUsage;

/*
|--------------------------------------------------------------------------
| How a failed classification or reranking call is stored
|--------------------------------------------------------------------------
|
| From SDK 1.2.2 each failed attempt fires a failure event naming its call, so
| the call is closed as failed with its own error and timing. Before it, the
| call is left for its caller or the stale rule, as the capture tests show.
|
*/

beforeEach(function () {
    if (! sdkReportsFailures()) {
        $this->markTestSkipped('Before SDK 1.2.2 a failed classification or reranking call fires no event of its own.');
    }
});

function failingCapabilityScript(string $capability, array $turns): void
{
    $capability === 'classification' ? FakeDecisions::script($turns) : FakeCohere::script($turns);
}

function failingCapabilityCall(string $capability, string|array|null $providers = null): void
{
    $capability === 'classification'
        ? Classification::of('Example')->question('valid', new Boolean('Valid?'))->classify($providers)
        : Reranking::of(['first', 'second'])->rerank('query', $providers);
}

function failingCapabilityIds(EventLog $sdk, string $capability): array
{
    return array_map(fn ($entry) => $entry->invocationId, $sdk->of($capability === 'classification' ? Classifying::class : RerankingEvent::class));
}

function failingCapabilitySuccess(string $capability): array
{
    return ['body' => $capability === 'classification' ? ['answers' => []] : ['results' => []]];
}

dataset('failing capabilities', ['classification', 'reranking']);

it('records a standalone call that fails as a failed trace of its own, timed and with its error', function (string $capability) {
    failingCapabilityScript($capability, [FakeDecisions::error(500)]);

    expect(fn () => failingCapabilityCall($capability))->toThrow(RequestException::class);
    [$id] = failingCapabilityIds($this->sdk, $capability);
    Trail::flush();
    $trace = Trace::query()->sole();
    $span = Span::query()->sole();

    expect($trace->id)->toBe($id)
        ->and($trace->type->value)->toBe($capability)
        ->and($trace->status->value)->toBe('failed')
        ->and($trace->error_class)->toBe(RequestException::class)
        ->and($trace->error_source->value)->toBe('run')
        ->and($trace->error_http_status)->toBe(500)
        ->and($trace->ended_at)->not->toBeNull()
        ->and($trace->duration_ms)->toBeFloat()
        ->and($span->id)->toBe($id)
        ->and($span->status->value)->toBe('failed')
        ->and($span->issue_kind->value)->toBe('exception')
        ->and($span->error_http_status)->toBe(500)
        ->and($span->duration_ms)->toBeFloat()
        ->and($span->output)->toBeNull()
        ->and($span->input_tokens)->toBeNull()
        ->and($span->cost)->toBeNull();
})->with('failing capabilities');

it('records a failed attempt as a failed trace and the attempt failover recovers with as a completed one', function (string $capability) {
    failingCapabilityScript($capability, [FakeDecisions::error(429), failingCapabilitySuccess($capability)]);

    failingCapabilityCall($capability, $capability === 'classification' ? ['typesafe', 'decisions-backup'] : ['cohere', 'rerank-backup']);
    [$failed, $recovered] = failingCapabilityIds($this->sdk, $capability);
    Trail::flush();

    expect(Trace::query()->findOrFail($failed)->status->value)->toBe('failed')
        ->and(Trace::query()->findOrFail($failed)->issue_kind->value)->toBe('rate_limited')
        ->and(Span::query()->findOrFail($failed)->error_class)->toBe(RateLimitedException::class)
        ->and(Trace::query()->findOrFail($recovered)->status->value)->toBe('completed')
        ->and(Trace::query()->where('status', 'running')->count())->toBe(0)
        ->and(Span::query()->where('status', 'running')->count())->toBe(0);
})->with('failing capabilities');

it('fails a call made in a tool with its own error, not as incomplete, when the tool catches it', function (string $capability) {
    failingCapabilityScript($capability, [FakeDecisions::error(500)]);
    FakeAnthropic::script([FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'decide', 'input' => []]]), FakeAnthropic::text('Done')]);
    $tool = new CallbackTool('decide', function () use ($capability) {
        try {
            failingCapabilityCall($capability);
        } catch (RequestException) {
            return 'caught';
        }

        return 'unreachable';
    });

    (new AssistantAgent([$tool]))->prompt('Hi', model: FakeAnthropic::MODEL);
    Trail::flush();
    $span = Span::query()->where('type', $capability)->sole();

    expect($span->status->value)->toBe('failed')
        ->and($span->error_class)->toBe(RequestException::class)
        ->and($span->error_http_status)->toBe(500)
        ->and($span->duration_ms)->toBeFloat()
        ->and($span->parent_id)->toBe(Span::query()->where('type', 'tool')->sole()->id)
        ->and(Trace::query()->sole()->status->value)->toBe('completed');
})->with('failing capabilities');

it('fails a call made in a tool with its own error when the failure fails the tool and the run', function (string $capability) {
    failingCapabilityScript($capability, [FakeDecisions::error(500)]);
    FakeAnthropic::script([FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'decide', 'input' => []]]), FakeAnthropic::text('Done')]);
    $tool = new CallbackTool('decide', function () use ($capability) {
        failingCapabilityCall($capability);

        return 'unreachable';
    });

    expect(fn () => (new AssistantAgent([$tool]))->prompt('Hi', model: FakeAnthropic::MODEL))->toThrow(RequestException::class);
    Trail::flush();
    $span = Span::query()->where('type', $capability)->sole();

    expect($span->status->value)->toBe('failed')
        ->and($span->error_source->value)->toBe('run')
        ->and($span->duration_ms)->toBeFloat()
        ->and(Span::query()->where('type', 'tool')->sole()->status->value)->toBe('failed')
        ->and(Trace::query()->sole()->status->value)->toBe('failed');
})->with('failing capabilities');

it('does not reopen a failed call for a late completion with the same id', function () {
    failingCapabilityScript('classification', [FakeDecisions::error(500)]);

    expect(fn () => failingCapabilityCall('classification'))->toThrow(RequestException::class);
    $start = $this->sdk->sole(Classifying::class)->event;
    Event::dispatch(new Classified($start->invocationId, $start->provider, $start->model, $start->prompt, new ClassificationResponse([], new TextUsage(5, 1), new Meta('typesafe', $start->model))));
    Trail::flush();
    $span = Span::query()->sole();

    expect($span->status->value)->toBe('failed')
        ->and($span->input_tokens)->toBeNull()
        ->and($span->output)->toBeNull();
});
