<?php

use Astro\Trail\Tests\Fixtures\Sdk\FakeDecisions;
use Composer\InstalledVersions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Laravel\Ai\Classification;
use Laravel\Ai\Classification\Boolean;
use Laravel\Ai\Classification\Choice;
use Laravel\Ai\Classification\Score;
use Laravel\Ai\Events\Classified;
use Laravel\Ai\Events\Classifying;
use Laravel\Ai\Files\Image;
use Laravel\Ai\Prompts\ClassificationPrompt;

/** A test-only example of the property guard needed by an event consumer. */
function sdkClassificationAttachments(ClassificationPrompt $prompt): ?array
{
    return property_exists($prompt, 'attachments') ? $prompt->attachments : null;
}

it('guards attachment access on the installed SDK through an actual provider prompt', function () {
    FakeDecisions::script([FakeDecisions::response(['answers' => []])]);
    Classification::of('Example')->question('valid', new Boolean('Valid?'))->classify();
    $prompt = $this->sdk->sole(Classifying::class)->event->prompt;
    $hasAttachments = version_compare(InstalledVersions::getVersion('laravel/ai'), '1.2.0', '>=');

    expect(property_exists($prompt, 'attachments'))->toBe($hasAttachments)
        ->and(sdkClassificationAttachments($prompt))->toBe($hasAttachments ? [] : null)
        ->and($this->sdk->timeline())->toBe(['Classifying', 'Classified']);
});

describe('SDK 1.2 classification attachments', function () {
    beforeEach(function () {
        if (version_compare(InstalledVersions::getVersion('laravel/ai'), '1.2.0', '<')) {
            $this->markTestSkipped('Laravel AI SDK 1.1 has no classification attachments; this provider-path gate requires SDK 1.2.');
        }
    });

    it('carries supported OpenAI images and uploads in a readonly prompt array', function () {
        $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=');
        $path = tempnam(sys_get_temp_dir(), 'trail-image-');
        file_put_contents($path, $png);
        config(['filesystems.disks.classification-images' => ['driver' => 'local', 'root' => dirname($path)]]);
        Http::fake(['93.184.216.34/*' => Http::response($png, 200, ['Content-Type' => 'image/png'])]);
        $attachments = [
            Image::fromBase64(base64_encode($png), 'image/png')->as('inline.png'),
            Image::fromUrl('https://93.184.216.34/image.png'),
            Image::fromPath($path, 'image/png'),
            Image::fromStorage(basename($path), 'classification-images'),
            UploadedFile::fake()->createWithContent('uploaded.png', $png),
        ];
        $fake = FakeDecisions::script([FakeDecisions::response([
            'answers' => [['type' => 'predicate', 'name' => 'valid', 'probability' => 0.8]],
            'usage' => ['input_tokens' => 11, 'output_tokens' => 2],
        ])]);
        try {
            $response = Classification::of('Describe the images', $attachments)->question('valid', new Boolean('Valid?'))->classify('openai', 'requested-model');
        } finally {
            unlink($path);
        }
        $prompt = $this->sdk->sole(Classifying::class)->event->prompt;

        expect($this->sdk->timeline())->toBe(['Classifying', 'Classified'])
            ->and(sdkClassificationAttachments($prompt))->toBe($attachments)
            ->and($this->sdk->sole(Classified::class)->event->prompt)->toBe($prompt)
            ->and((new ReflectionProperty($prompt, 'attachments'))->isReadOnly())->toBeTrue()
            ->and((new ReflectionProperty($prompt, 'attachments'))->getType()->getName())->toBe('array')
            ->and(array_map(fn ($attachment) => class_basename($attachment), array_slice($prompt->attachments, 0, 4)))->toBe(['Base64Image', 'RemoteImage', 'LocalImage', 'StoredImage'])
            ->and($prompt->attachments[4])->toBeInstanceOf(UploadedFile::class)
            ->and($response->answer('valid')->probability)->toBe(0.8)
            ->and($response->usage->inputTokens)->toBe(11)
            ->and($fake->urls)->toBe(['https://api.openai.com/v1/decisions'])
            ->and($fake->requests[0]['questions'])->toBe([['type' => 'predicate', 'name' => 'valid', 'instructions' => 'Valid?']])
            ->and($fake->requests[0]['input'])->toBe([[
                'role' => 'user', 'content' => [
                    ['type' => 'input_text', 'text' => 'Describe the images'],
                    ...array_fill(0, 5, ['type' => 'input_image', 'image_url' => 'data:image/png;base64,'.base64_encode($png)]),
                ],
            ]])
            ->and($fake->remaining())->toBe(0);
        Http::assertSentCount(2); // One mocked remote image fetch and one mocked decisions request.
    });

    it('uses OpenAI answer names and predicate types while preserving score probability order', function () {
        FakeDecisions::script([FakeDecisions::response([
            'answers' => [
                ['type' => 'predicate', 'name' => 'valid', 'probability' => 0.73],
                ['type' => 'choice', 'name' => 'category', 'choice' => 'a', 'confidence' => 0.0, 'probabilities' => [['value' => 'b', 'probability' => 0.2], ['value' => 'a', 'probability' => 0.8]]],
                ['type' => 'score', 'name' => 'quality', 'score' => 1.25, 'probabilities' => [['value' => 2, 'probability' => 0.6], ['value' => 0, 'probability' => 0.1], ['value' => 1, 'probability' => 0.3]]],
                ['type' => 'refusal', 'name' => 'refused'],
                ['type' => 'future', 'name' => 'unknown'],
                ['type' => 'predicate', 'probability' => 0.9],
            ],
            'model' => 'reported-model',
        ])]);
        $response = Classification::of('Example')->questions([
            'valid' => new Boolean('Valid?'),
            'category' => new Choice('Category?', ['a' => 'First', 'b' => 'Second']),
            'quality' => new Score('Quality?', ['low', 'medium', 'high']),
        ])->classify('openai', 'requested-model');

        expect(array_keys($response->answers))->toBe(['valid', 'category', 'quality'])
            ->and($response->answer('valid')->probability)->toBe(0.73)
            ->and($response->answer('category')->toArray())->toBe(['choice' => 'a', 'probabilities' => ['b' => 0.2, 'a' => 0.8], 'confidence' => 0.0])
            ->and($response->answer('quality')->toArray())->toBe(['score' => 1.25, 'probabilities' => [2 => 0.6, 0 => 0.1, 1 => 0.3], 'legend' => ['low', 'medium', 'high'], 'confidence' => null])
            ->and($response->meta->model)->toBe('reported-model');
    });

    it('rejects attachments on decisions providers before dispatching a start', function (string $provider) {
        expect(fn () => Classification::of('Example', [Image::fromBase64(base64_encode('fixture'), 'image/png')])
            ->question('valid', new Boolean('Valid?'))->classify($provider))
            ->toThrow(LogicException::class, "Provider [{$provider}] does not support classification attachments.");
        expect($this->sdk->names())->toBe([]);
        Http::assertNothingSent();
    })->with(['typesafe', 'openrouter']);

    it('rejects provider IDs unsupported MIME types and private remote addresses after the OpenAI start', function (string $kind) {
        $image = match ($kind) {
            'provider-id' => Image::fromId('provider-image'),
            'blocked-remote' => Image::fromUrl('https://127.0.0.1/image.png'),
            default => Image::fromBase64(base64_encode('fixture'), 'image/svg+xml'),
        };
        expect(fn () => Classification::of('Example', [$image])->question('valid', new Boolean('Valid?'))->classify('openai'))
            ->toThrow(InvalidArgumentException::class);
        expect($this->sdk->names())->toBe(['Classifying']);
        Http::assertNothingSent();
    })->with(['provider-id', 'unsupported-mime', 'blocked-remote']);
});
