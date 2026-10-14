<?php

use Astro\Trail\Capture\Payload;
use Astro\Trail\Capture\Recorder;
use Astro\Trail\Enums\SpanType;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Pricing\CostCalculator;
use Astro\Trail\Storage\Models\Span;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Sdk\FakeCohere;
use Astro\Trail\Tests\Fixtures\Sdk\FakeDecisions;
use Astro\Trail\Tests\Fixtures\Sdk\ScriptedClassificationGateway;
use Astro\Trail\Tests\Fixtures\Tools\CallbackTool;
use Composer\InstalledVersions;
use Illuminate\Support\Facades\Event;
use Laravel\Ai\Ai;
use Laravel\Ai\Classification;
use Laravel\Ai\Classification\Boolean;
use Laravel\Ai\Classification\Choice;
use Laravel\Ai\Classification\Score;
use Laravel\Ai\Events\Classifying;
use Laravel\Ai\Events\Reranking as RerankingEvent;
use Laravel\Ai\Files\Image;
use Laravel\Ai\Gateway\ParentInvocation;
use Laravel\Ai\Prompts\RerankingPrompt;
use Laravel\Ai\Reranking;
use Laravel\Ai\Responses\ClassificationResponse;
use Laravel\Ai\Responses\Data\BooleanAnswer;
use Laravel\Ai\Responses\Data\Meta;
use Laravel\Ai\Responses\Data\TextUsage;

it('captures all answers and prices classification with the responding model', function () {
    config(['trail.pricing.typesafe' => ['reported' => ['input' => 2, 'output' => 4]]]);
    FakeDecisions::script([FakeDecisions::response([
        'answers' => ['yes' => ['type' => 'noul', 'noul' => 0.7], 'kind' => ['type' => 'choice', 'choice' => 'a', 'probabilities' => ['a' => 0.8, 'b' => 0.2]], 'score' => ['type' => 'score', 'score' => 0.6, 'confidence' => 0.4]],
        'usage' => ['input_tokens' => 17, 'output_tokens' => 3], 'routing' => ['model' => 'reported'],
    ])]);
    Classification::of(['password' => 'private', 'text' => 'Example'])->questions([
        'yes' => new Boolean('Valid?'), 'kind' => new Choice('Kind?', ['a' => 'A', 'b' => 'B']), 'score' => new Score('Score?', ['low', 'high']),
    ])->classify('typesafe', 'requested');
    Trail::flush();
    $span = Span::query()->sole();
    expect($span->id)->toBe($this->sdk->sole(Classifying::class)->invocationId)
        ->and($span->type)->toBe(SpanType::Classification)
        ->and($span->input['state']['password'])->toBe('[redacted]')
        ->and($span->output['answers']['yes']['probability'])->toBe(0.7)
        ->and($span->output['answers']['kind']['probabilities'])->toBe(['a' => 0.8, 'b' => 0.2])
        ->and($span->output['answers']['score']['confidence'])->toBe(0.4)
        ->and((float) $span->cost)->toBe(0.000046)
        ->and($span->duration_ms)->toBeGreaterThan(0)
        ->and(Trace::query()->sole()->type)->toBe(SpanType::Classification);
});

it('records reranking quantities separately from structural output zero and preserves result order', function () {
    FakeCohere::script([FakeCohere::response(['results' => [['index' => 2, 'relevance_score' => 0.9], ['index' => 0, 'relevance_score' => 0.5]], 'meta' => ['billed_units' => ['search_units' => 1.5]]])]);
    Reranking::of(['first', 'second', 'third'])->limit(2)->rerank('query');
    Trail::flush();
    $span = Span::query()->sole();
    expect($span->input['documents'])->toHaveCount(3)
        ->and(array_column($span->output['results'], 'index'))->toBe([2, 0])
        ->and($span->output['results'][0])->toBe(['index' => 2, 'score' => 0.9])
        ->and($span->search_units)->toBe(1500000)
        ->and($span->input_tokens)->toBeNull()->and($span->output_tokens)->toBeNull()
        ->and($span->billing_basis)->toBe('search_units')
        ->and((float) $span->cost)->toEqualWithDelta(0.00375, 1e-12);
});

it('keeps only structural counts when payload capture is disabled', function () {
    config(['trail.capture.enabled' => false]);
    FakeCohere::script([FakeCohere::response(['results' => [['index' => 0, 'relevance_score' => 0.9]], 'meta' => ['billed_units' => ['search_units' => 0]]])]);
    Reranking::of(['secret document'])->rerank('secret query');
    Trail::flush();
    $span = Span::query()->sole();
    expect($span->input)->toBe(['document_count' => 1, 'limit' => null])->and($span->output)->toBe(['result_count' => 1])->and($span->search_units)->toBe(0);
});

it('closes a missing nested terminal as incomplete without copying the caller error or timing', function () {
    $tool = new CallbackTool('rank', function () {
        $provider = Ai::rerankingProvider('cohere');
        Event::dispatch(new RerankingEvent('lost-terminal', $provider, 'rank-model', new RerankingPrompt(['document'], 'query', null, $provider, 'rank-model')));

        return 'Done';
    });
    FakeAnthropic::script([FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'rank', 'input' => []]]), FakeAnthropic::text('Done')]);
    (new AssistantAgent([$tool]))->prompt('Hi', model: FakeAnthropic::MODEL);
    Trail::flush();
    $span = Span::query()->findOrFail('lost-terminal');
    expect($span->status->value)->toBe('incomplete')->and($span->duration_ms)->toBeNull()->and($span->error_class)->toBeNull()
        ->and($span->parent_id)->toBe(Span::query()->where('type', 'tool')->sole()->id)
        ->and(Trace::query()->count())->toBe(1);
});

it('never creates an orphan capability for an unknown parent or a sampled out root', function () {
    $provider = Ai::rerankingProvider('cohere');
    ParentInvocation::within('unknown-parent', 'unknown-tool', fn () => Event::dispatch(new RerankingEvent('orphan', $provider, 'rank-model', new RerankingPrompt(['document'], 'query', null, $provider, 'rank-model'))));
    config(['trail.recording.sample_rate' => 0]);
    // Public withoutRecording applies the same suppression to standalone calls.
    Trail::withoutRecording(function () {
        Reranking::fake();
        Reranking::of(['document'])->rerank('query');
    });
    Trail::flush();
    expect(Trace::query()->count())->toBe(0)->and(Span::query()->count())->toBe(0);
});

it('flushes capability state at every worker boundary over one hundred cycles', function () {
    for ($i = 0; $i < 105; $i++) {
        Reranking::fake();
        Reranking::of(['document'])->rerank('query');
        Trail::flush();
    }
    $recorder = app(Recorder::class);
    foreach (['capabilities', 'ambiguousCapabilities', 'buffers', 'runs', 'skipped'] as $field) {
        expect((new ReflectionProperty($recorder, $field))->getValue($recorder))->toBe([]);
    }
    expect(Trace::query()->count())->toBe(105);
});

it('bounds capability payloads across both events and redacts before clipping snippets', function () {
    config(['trail.capture.max_items' => 100, 'trail.capture.max_length' => 2000]);
    Reranking::fake();
    $secret = '"password":"supersecret"';
    Reranking::of(array_fill(0, 2000, str_repeat('é', 980).$secret.str_repeat('z', 9000)))->rerank(str_repeat('query', 9000));
    Trail::flush();
    $span = Span::query()->sole();
    $json = json_encode(['input' => $span->input, 'output' => $span->output], JSON_THROW_ON_ERROR);
    $nodes = function (mixed $value) use (&$nodes): int {
        return 1 + (is_array($value) ? array_sum(array_map($nodes, $value)) : 0);
    };
    expect(strlen($json))->toBeLessThanOrEqual(65536)
        ->and($nodes([$span->input, $span->output]))->toBeLessThanOrEqual(1000)
        ->and($json)->not->toContain('supersecret')
        ->and($span->input['document_count'])->toBe(2000)
        ->and(count($span->input['documents']))->toBeLessThanOrEqual(100)
        ->and($span->input['omitted_entries'])->toBeGreaterThan(0)
        ->and($span->redacted)->toBeTrue()->and($span->truncated)->toBeTrue();
});

it('preserves fixed answer fields at a collection limit of one and does not infer token totals from zero cache subsets', function () {
    config(['trail.capture.max_items' => 1]);
    $response = new ClassificationResponse(['valid' => new BooleanAnswer(0.8)], new TextUsage(0, 0, 0, 0, 0), new Meta('typesafe', 'reported'));
    Ai::classificationProvider('typesafe')->useClassificationGateway(new ScriptedClassificationGateway(fn () => $response));
    Classification::of('State')->questions(['valid' => new Boolean('Valid?', ['true' => 'Yes', 'false' => 'No']), 'extra' => new Boolean('Extra?')])->classify();
    Trail::flush();
    $span = Span::query()->sole();
    expect($span->input['questions'])->toHaveCount(1)->and($span->input['questions']['valid']['instructions'])->toBe('Valid?')
        ->and($span->output['answers']['valid'])->toBe(['type' => 'boolean', 'probability' => 0.8])
        ->and($span->input_tokens)->toBeNull()->and($span->output_tokens)->toBeNull()->and($span->cache_read_tokens)->toBe(0)
        ->and($span->cache_write_tokens)->toBe(0)->and($span->reasoning_tokens)->toBe(0)->and($span->cost)->toBeNull();
});

it('ignores duplicate capability events without resampling or overwriting completed evidence', function () {
    FakeCohere::script([FakeCohere::response(['results' => [['index' => 0, 'relevance_score' => 0.8]], 'meta' => ['billed_units' => ['search_units' => 1.5]]])]);
    Reranking::of(['document'])->rerank('query');
    $start = $this->sdk->sole(RerankingEvent::class)->event;
    Event::dispatch($start);
    Trail::flush();
    expect(Span::query()->count())->toBe(1)->and(Span::query()->sole()->status->value)->toBe('completed')
        ->and(Span::query()->sole()->search_units)->toBe(1500000);
});

it('captures SDK 1.2 attachment descriptors without bytes, URLs or paths and honors capture disabled', function () {
    if (version_compare(InstalledVersions::getVersion('laravel/ai'), '1.2.0', '<')) {
        $this->markTestSkipped('Classification attachments require SDK 1.2.');
    }
    $bytes = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
    FakeDecisions::script([FakeDecisions::response(['answers' => []]), FakeDecisions::response(['answers' => []])]);
    Classification::of('Safe state', [Image::fromBase64($bytes, 'image/png')->as('inline.png')])->question('valid', new Boolean('Valid?'))->classify('openai', 'requested');
    Trail::flush();
    $span = Span::query()->sole();
    $json = json_encode($span->input, JSON_THROW_ON_ERROR);
    expect($span->input['attachment_count'])->toBe(1)->and($span->input['attachments'][0]['name'])->toBe('inline.png')
        ->and($json)->not->toContain($bytes)->not->toContain('base64,')->not->toContain('http')->not->toContain('/tmp/');
    config(['trail.capture.enabled' => false]);
    app()->forgetInstance(Payload::class);
    app()->forgetInstance(Recorder::class);
    Classification::of('Safe state', [Image::fromBase64($bytes, 'image/png')->as('private.png')])->question('valid', new Boolean('Valid?'))->classify('openai', 'requested');
    Trail::flush();
    expect(Span::query()->latest('created_at')->first()->input)->toBe(['question_count' => 1, 'attachment_count' => 1]);
});

it('retains nested completed evidence after skipped-ID eviction and uses reserved standalone names', function () {
    app()->instance(Recorder::class, new Recorder(app(), app(CostCalculator::class), maxSkippedIds: 1));
    $tool = new CallbackTool('rank', function () {
        Reranking::fake();
        Reranking::of(['document'])->rerank('query');
        $first = $this->sdk->of(RerankingEvent::class)[0]->event;
        Reranking::of(['next'])->rerank('next');
        Reranking::of(['last'])->rerank('last');
        Event::dispatch($first);

        return 'Done';
    });
    FakeAnthropic::script([FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'rank', 'input' => []]]), FakeAnthropic::text('Done')]);
    (new AssistantAgent([$tool]))->prompt('Hi', model: FakeAnthropic::MODEL);
    Trail::flush();
    expect(Span::query()->where('type', 'reranking')->count())->toBe(3)
        ->and(Span::query()->where('type', 'reranking')->where('status', 'running')->count())->toBe(0);
    Reranking::of(['standalone'])->rerank('query');
    Trail::flush();
    expect(Trace::query()->where('type', 'reranking')->sole()->name)->toBe('Reranking calls');
});
