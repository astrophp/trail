<?php

use Astro\Trail\Tests\Fixtures\Sdk\FakeDecisions;
use Astro\Trail\Tests\Fixtures\Sdk\ScriptedClassificationGateway;
use Illuminate\Support\Facades\Http;
use Laravel\Ai\Ai;
use Laravel\Ai\Classification;
use Laravel\Ai\Classification\Boolean;
use Laravel\Ai\Classification\Choice;
use Laravel\Ai\Classification\Score;
use Laravel\Ai\Events\Classified;
use Laravel\Ai\Events\Classifying;
use Laravel\Ai\Responses\ClassificationResponse;
use Laravel\Ai\Responses\Data\BooleanAnswer;
use Laravel\Ai\Responses\Data\ChoiceAnswer;
use Laravel\Ai\Responses\Data\Meta;
use Laravel\Ai\Responses\Data\ScoreAnswer;
use Laravel\Ai\Responses\Data\TextUsage;

it('maps all public answer types through the decisions HTTP gateway', function (string $provider, string $url) {
    $fake = FakeDecisions::script([FakeDecisions::response([
        'answers' => [
            'valid' => ['type' => 'noul', 'noul' => 0.73],
            'category' => ['type' => 'choice', 'choice' => 'a', 'probabilities' => ['b' => 0.2, 'a' => 0.8]],
            'quality' => ['type' => 'score', 'score' => 1.25, 'probabilities' => ['02' => 0.6, '0' => 0.1, '01' => 0.3], 'legend' => ['02' => 'high', '0' => 'low', '01' => 'medium']],
            'unknown' => ['type' => 'future'],
        ],
        'usage' => ['input_tokens' => 17, 'output_tokens' => 9, 'cache_read_input_tokens' => 4, 'reasoning_tokens' => 3],
        'model' => 'reported-model',
        'routing' => ['model' => 'routed-model'],
    ])]);
    $questions = [
        'valid' => new Boolean('Is it valid?', ['true' => 'Valid', 'false' => 'Invalid']),
        'category' => new Choice('Category?', ['a' => 'First', 'b' => 'Second']),
        'quality' => new Score('Quality?', ['low', 'medium', 'high']),
    ];

    $response = Classification::of(['text' => 'Example'])->questions($questions)->timeout(7)->classify($provider, 'requested-model');
    $start = $this->sdk->sole(Classifying::class);
    $end = $this->sdk->sole(Classified::class);

    expect($this->sdk->timeline())->toBe(['Classifying', 'Classified'])
        ->and($start->invocationId)->toMatch('/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/')
        ->and($end->invocationId)->toBe($start->invocationId)
        ->and($end->event->prompt)->toBe($start->event->prompt)
        ->and($end->event->response)->toBe($response)
        ->and($start->parentInvocation)->toBe([null, null])
        ->and($end->parentInvocation)->toBe([null, null])
        ->and($start->event->model)->toBe('requested-model')
        ->and($start->event->prompt->state)->toBe(['text' => 'Example'])
        ->and($start->event->prompt->questions)->toBe($questions)
        ->and($start->event->prompt->timeout)->toBe(7)
        ->and(property_exists($start->event->prompt, 'parentInvocationId'))->toBeFalse()
        ->and($response->answer('valid'))->toBeInstanceOf(BooleanAnswer::class)
        ->and($response->answer('valid')->probability)->toBe(0.73)
        ->and($response->answer('category'))->toBeInstanceOf(ChoiceAnswer::class)
        ->and($response->answer('category')->toArray())->toBe(['choice' => 'a', 'probabilities' => ['b' => 0.2, 'a' => 0.8], 'confidence' => null])
        ->and($response->answer('quality'))->toBeInstanceOf(ScoreAnswer::class)
        ->and($response->answer('quality')->toArray())->toBe(['score' => 1.25, 'probabilities' => [0 => 0.1, 1 => 0.3, 2 => 0.6], 'legend' => ['low', 'medium', 'high'], 'confidence' => null])
        ->and(array_keys($response->answers))->toBe(['valid', 'category', 'quality'])
        ->and($response->usage->toArray())->toBe(['input_tokens' => 17, 'output_tokens' => 9, 'cache_read_input_tokens' => null, 'cache_write_input_tokens' => null, 'reasoning_tokens' => null])
        ->and($response->meta->model)->toBe($provider === 'typesafe' ? 'routed-model' : 'reported-model')
        ->and($fake->urls)->toBe([$url])
        ->and($fake->requests[0])->toBe([
            'model' => 'requested-model', 'state' => ['text' => 'Example'],
            'questions' => [
                'valid' => ['type' => 'noul', 'instructions' => 'Is it valid?', 'criteria' => ['true' => 'Valid', 'false' => 'Invalid']],
                'category' => ['type' => 'choice', 'instructions' => 'Category?', 'criteria' => ['a' => 'First', 'b' => 'Second']],
                'quality' => ['type' => 'score', 'instructions' => 'Quality?', 'criteria' => ['low', 'medium', 'high']],
            ],
        ])
        ->and($fake->remaining())->toBe(0);
})->with([
    'TypeSafe' => ['typesafe', 'https://api.typesafe.ai/v1/systemone'],
    'OpenRouter' => ['openrouter', 'https://openrouter.ai/api/alpha/decisions'],
]);

it('falls back to the requested model and question levels and loses zero token presence', function (array $usage) {
    FakeDecisions::script([FakeDecisions::response([
        'answers' => ['quality' => ['type' => 'score', 'score' => 0.4, 'confidence' => 0.8]],
        'usage' => $usage,
    ])]);

    $response = Classification::of('Example')->question('quality', new Score('Quality?', ['low', 'high']))->classify('typesafe', 'requested-model');

    expect($response->answer('quality')->legend)->toBe(['low', 'high'])
        ->and($response->answer('quality')->confidence)->toBe(0.8)
        ->and($response->meta->model)->toBe('requested-model')
        ->and($response->usage->toArray())->toBe((new TextUsage)->toArray());
})->with(['omitted totals' => [[]], 'explicit zero totals' => [['input_tokens' => 0, 'output_tokens' => 0]]]);

it('preserves explicitly supplied zero cache and reasoning subsets from a gateway DTO', function () {
    $usage = new TextUsage(12, 3, 0, 0, 0);
    $expected = new ClassificationResponse(['valid' => new BooleanAnswer(0.6)], $usage, new Meta('typesafe', 'reported'));
    Ai::classificationProvider('typesafe')->useClassificationGateway(new ScriptedClassificationGateway(fn () => $expected));

    $response = Classification::of('Example')->question('valid', new Boolean('Valid?'))->classify();

    expect($response)->toBe($expected)
        ->and($this->sdk->sole(Classified::class)->event->response->usage)->toBe($usage)
        ->and($usage->toArray())->toBe(['input_tokens' => 12, 'output_tokens' => 3, 'cache_read_input_tokens' => 0, 'cache_write_input_tokens' => 0, 'reasoning_tokens' => 0]);
    Http::assertNothingSent();
});

it('also emits the same event pair for the SDK fake with default usage', function () {
    Classification::fake([['valid' => new BooleanAnswer(0.6)]]);

    $response = Classification::of('Example')->question('valid', new Boolean('Valid?'))->classify();

    expect($this->sdk->timeline())->toBe(['Classifying', 'Classified'])
        ->and($response->usage->toArray())->toBe((new TextUsage)->toArray());
    Http::assertNothingSent();
});
