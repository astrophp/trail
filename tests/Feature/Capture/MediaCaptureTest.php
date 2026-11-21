<?php

use Astro\Trail\Capture\Recorder;
use Astro\Trail\Facades\Trail;
use Astro\Trail\Pricing\CostCalculator;
use Astro\Trail\Storage\Models\Span;
use Astro\Trail\Storage\Models\Trace;
use Astro\Trail\Tests\Fixtures\Agents\AssistantAgent;
use Astro\Trail\Tests\Fixtures\Capture\ThrowingRecorder;
use Astro\Trail\Tests\Fixtures\Sdk\FakeAnthropic;
use Astro\Trail\Tests\Fixtures\Tools\CallbackTool;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Http;
use Laravel\Ai\Audio;
use Laravel\Ai\Events\GeneratingAudio;
use Laravel\Ai\Events\GeneratingImage;
use Laravel\Ai\Events\GeneratingTranscription;
use Laravel\Ai\Events\ImageGenerated;
use Laravel\Ai\Exceptions\RateLimitedException;
use Laravel\Ai\Image;
use Laravel\Ai\Responses\Data\GeneratedImage;
use Laravel\Ai\Responses\Data\ImageUsage;
use Laravel\Ai\Responses\Data\Meta;
use Laravel\Ai\Responses\ImageResponse;
use Laravel\Ai\Transcription;

/*
|--------------------------------------------------------------------------
| How image, audio and transcription calls are stored
|--------------------------------------------------------------------------
|
| Each call is a trace of its own when it is made on its own, and a span under
| the tool that made it otherwise. What it was asked for is kept as settings and
| counts, its texts only when payloads are captured, and never image or audio
| bytes. From SDK 1.2.2 a failed attempt fires an event naming its call.
|
*/

const MEDIA_PNG = 'not really a png';

const MEDIA_MP3 = 'not really an mp3';

beforeEach(function () {
    config(['ai.providers.second' => ['driver' => 'openai', 'key' => 'test-key', 'url' => 'https://second.openai.test/v1']]);
});

/** A response for each OpenAI media endpoint, or the given status for all of them. */
function fakeOpenAiMedia(?int $status = null, string $host = 'api.openai.com'): void
{
    $error = fn () => Http::response(['error' => ['message' => 'Scripted provider failure.']], $status ?? 500);

    Http::fake([
        "{$host}/v1/images/*" => $status !== null ? $error : Http::response([
            'data' => [['b64_json' => base64_encode(MEDIA_PNG)], ['b64_json' => base64_encode(MEDIA_PNG)]],
            'usage' => ['input_tokens' => 12, 'output_tokens' => 400, 'input_tokens_details' => ['image_tokens' => 0], 'output_tokens_details' => ['image_tokens' => 400]],
        ]),
        "{$host}/v1/audio/speech" => $status !== null ? $error : Http::response(MEDIA_MP3),
        "{$host}/v1/audio/transcriptions" => $status !== null ? $error : Http::response([
            'text' => 'Hello from the recording.',
            'usage' => ['input_tokens' => 30, 'output_tokens' => 6, 'seconds' => 3.5],
        ]),
    ]);
}

function mediaCall(string $type, string|array $providers = 'openai'): mixed
{
    return match ($type) {
        'image' => Image::of('A lighthouse at dusk')->size('3:2')->quality('high')->generate($providers, 'gpt-image-1'),
        'audio' => Audio::of('Welcome aboard.')->voice('alloy')->instructions('Speak warmly.')->generate($providers, 'gpt-4o-mini-tts'),
        'transcription' => Transcription::fromBase64(base64_encode(MEDIA_MP3), 'audio/mpeg')->language('en')->generate($providers, 'gpt-4o-transcribe'),
    };
}

function mediaStartEvent(string $type): string
{
    return match ($type) {
        'image' => GeneratingImage::class,
        'audio' => GeneratingAudio::class,
        'transcription' => GeneratingTranscription::class,
    };
}

dataset('media calls', ['image', 'audio', 'transcription']);

describe('on its own', function () {
    it('is a completed trace of its own whose span id is the trace id', function (string $type) {
        fakeOpenAiMedia();

        mediaCall($type);
        $id = $this->sdk->sole(mediaStartEvent($type))->invocationId;
        Trail::flush();
        $trace = Trace::query()->sole();
        $span = Span::query()->sole();

        expect($trace->id)->toBe($id)
            ->and($trace->type->value)->toBe($type)
            ->and($trace->name)->toBe(ucfirst($type).' calls')
            ->and($trace->status->value)->toBe('completed')
            ->and($trace->provider)->toBe('openai')
            ->and($trace->duration_ms)->toBeFloat()
            ->and($span->id)->toBe($id)
            ->and($span->type->value)->toBe($type)
            ->and($span->parent_id)->toBeNull()
            ->and($span->status->value)->toBe('completed')
            ->and($span->duration_ms)->toBeFloat()
            ->and($span->ended_at)->not->toBeNull();
    })->with('media calls');

    it('stores an image call\'s prompt and settings, how many images came back and its tokens, never the images', function () {
        fakeOpenAiMedia();

        mediaCall('image');
        Trail::flush();
        $span = Span::query()->sole();

        expect($span->input)->toBe(['prompt' => 'A lighthouse at dusk', 'attachments' => [], 'size' => '3:2', 'quality' => 'high', 'attachment_count' => 0])
            ->and($span->output)->toBe(['count' => 2, 'mime_types' => ['image/png']])
            ->and($span->input_tokens)->toBe(12)
            ->and($span->output_tokens)->toBe(400)
            ->and($span->metadata)->toBe(['image_input_tokens' => 0, 'image_output_tokens' => 400])
            ->and(json_encode([$span->input, $span->output]))->not->toContain(base64_encode(MEDIA_PNG))
            ->and(Trace::query()->sole()->prompt_excerpt)->toBe('A lighthouse at dusk');
    });

    it('stores an audio call\'s text, voice and length, the audio\'s type and size, and no tokens when the provider sends none', function () {
        fakeOpenAiMedia();

        mediaCall('audio');
        Trail::flush();
        $span = Span::query()->sole();
        $trace = Trace::query()->sole();

        expect($span->input)->toBe(['text' => 'Welcome aboard.', 'instructions' => 'Speak warmly.', 'voice' => 'alloy', 'characters' => 15])
            ->and($span->output)->toBe(['mime_type' => 'audio/mpeg', 'size' => strlen(MEDIA_MP3)])
            ->and($span->input_tokens)->toBeNull()
            ->and($span->output_tokens)->toBeNull()
            ->and($span->cost)->toBeNull()
            ->and(json_encode($span->output))->not->toContain(base64_encode(MEDIA_MP3))
            ->and($trace->prompt_excerpt)->toBe('Welcome aboard.')
            ->and($trace->cost)->toBeNull()
            ->and($trace->unknown_cost_calls)->toBe(1)
            ->and($trace->unpriced_span_count)->toBe(0);
    });

    it('stores a transcription\'s text, the audio it was given without its bytes, and the seconds the provider measured', function () {
        fakeOpenAiMedia();

        mediaCall('transcription');
        Trail::flush();
        $span = Span::query()->sole();

        expect($span->input)->toBe(['audio' => ['type' => 'base64-audio', 'name' => null, 'size' => strlen(MEDIA_MP3)], 'language' => 'en', 'diarize' => false])
            ->and($span->output)->toBe(['text' => 'Hello from the recording.', 'segment_count' => 0])
            ->and($span->input_tokens)->toBe(30)
            ->and($span->output_tokens)->toBe(6)
            ->and($span->metadata)->toBe(['audio_seconds' => 3.5])
            ->and(json_encode($span->input))->not->toContain(base64_encode(MEDIA_MP3))
            ->and(Trace::query()->sole()->response_excerpt)->toBe('Hello from the recording.');
    });

    it('keeps only settings and counts when payload capture is off', function (string $type, array $input, array $output) {
        config(['trail.capture.enabled' => false]);
        fakeOpenAiMedia();

        mediaCall($type);
        Trail::flush();
        $span = Span::query()->sole();

        expect($span->input)->toBe($input)
            ->and($span->output)->toBe($output)
            ->and(Trace::query()->sole()->prompt_excerpt)->toBeNull()
            ->and(Trace::query()->sole()->response_excerpt)->toBeNull();
    })->with([
        'image' => ['image', ['size' => '3:2', 'quality' => 'high', 'attachment_count' => 0], ['count' => 2, 'mime_types' => ['image/png']]],
        'audio' => ['audio', ['voice' => 'alloy', 'characters' => 15], ['mime_type' => 'audio/mpeg', 'size' => strlen(MEDIA_MP3)]],
        'transcription' => ['transcription', ['language' => 'en', 'diarize' => false], ['segment_count' => 0]],
    ]);

    it('redacts a secret in the text it stores', function () {
        fakeOpenAiMedia();

        Audio::of('Your key is sk-proj-abcdefghijklmnopqrstuvwxyz0123456789')->generate('openai', 'gpt-4o-mini-tts');
        Trail::flush();
        $span = Span::query()->sole();

        expect($span->redacted)->toBeTrue()
            ->and(json_encode($span->input))->not->toContain('abcdefghijklmnopqrstuvwxyz0123456789')
            ->and(Trace::query()->sole()->prompt_excerpt)->not->toContain('abcdefghijklmnopqrstuvwxyz0123456789');
    });

    it('is priced from its reported tokens when its model has a price, and Unpriced when it has none', function () {
        config(['trail.pricing' => ['openai' => ['gpt-image-1' => ['input' => 5.0, 'output' => 40.0]]]]);
        fakeOpenAiMedia();

        mediaCall('image');
        mediaCall('transcription');
        Trail::flush();
        $image = Span::query()->where('type', 'image')->sole();
        $transcription = Span::query()->where('type', 'transcription')->sole();

        expect($image->cost)->toBe(round((12 * 5.0 + 400 * 40.0) / 1_000_000, 10))
            ->and($image->billing_basis)->toBe('input_tokens')
            ->and($transcription->cost)->toBeNull()
            ->and(Trace::query()->findOrFail($transcription->trace_id)->unpriced_span_count)->toBe(1);
    });

    it('is not recorded when the filter declines it, and the filter sees its type and text', function () {
        $seen = [];
        Trail::filter(function ($candidate) use (&$seen) {
            $seen[] = [$candidate->type->value, $candidate->prompt];

            return false;
        });
        fakeOpenAiMedia();

        mediaCall('image');
        mediaCall('transcription');
        Trail::flush();

        expect(Trace::query()->count())->toBe(0)
            ->and($seen)->toBe([['image', 'A lighthouse at dusk'], ['transcription', null]]);
    });
});

describe('inside a tool', function () {
    it('is a span under the tool call, with its tokens counted in the trace', function (string $type) {
        fakeOpenAiMedia();
        FakeAnthropic::script([FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'make', 'input' => []]]), FakeAnthropic::text('Done')]);
        $tool = new CallbackTool('make', function () use ($type) {
            mediaCall($type);

            return 'made';
        });

        (new AssistantAgent([$tool]))->prompt('Hi', model: FakeAnthropic::MODEL);
        Trail::flush();
        $span = Span::query()->where('type', $type)->sole();

        expect(Trace::query()->count())->toBe(1)
            ->and($span->status->value)->toBe('completed')
            ->and($span->parent_id)->toBe(Span::query()->where('type', 'tool')->sole()->id)
            ->and($span->trace_id)->toBe(Trace::query()->sole()->id)
            ->and(Trace::query()->sole()->status->value)->toBe('completed');
    })->with('media calls');

    it('fails with its own error, or is left incomplete before SDK 1.2.2, when the tool catches the failure', function (string $type) {
        fakeOpenAiMedia(500);
        FakeAnthropic::script([FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'make', 'input' => []]]), FakeAnthropic::text('Done')]);
        $tool = new CallbackTool('make', function () use ($type) {
            try {
                mediaCall($type);
            } catch (RequestException) {
                return 'caught';
            }

            return 'unreachable';
        });

        (new AssistantAgent([$tool]))->prompt('Hi', model: FakeAnthropic::MODEL);
        Trail::flush();
        $span = Span::query()->where('type', $type)->sole();

        expect($span->parent_id)->toBe(Span::query()->where('type', 'tool')->sole()->id)
            ->and(Trace::query()->sole()->status->value)->toBe('completed');

        if (sdkReportsFailures()) {
            expect($span->status->value)->toBe('failed')
                ->and($span->error_class)->toBe(RequestException::class)
                ->and($span->error_http_status)->toBe(500)
                ->and($span->duration_ms)->toBeFloat();
        } else {
            // The tool returned while the call never ended: nothing proves an error or a duration.
            expect($span->status->value)->toBe('incomplete')
                ->and($span->error_class)->toBeNull()
                ->and($span->duration_ms)->toBeNull();
        }
    })->with('media calls');

    it('fails with its own error, or is left incomplete before SDK 1.2.2, when the failure fails the run', function (string $type) {
        fakeOpenAiMedia(500);
        FakeAnthropic::script([FakeAnthropic::toolUse([['id' => 'toolu_1', 'name' => 'make', 'input' => []]]), FakeAnthropic::text('Done')]);
        $tool = new CallbackTool('make', function () use ($type) {
            mediaCall($type);

            return 'unreachable';
        });

        expect(fn () => (new AssistantAgent([$tool]))->prompt('Hi', model: FakeAnthropic::MODEL))->toThrow(RequestException::class);
        Trail::flush();
        $span = Span::query()->where('type', $type)->sole();

        expect(Trace::query()->sole()->status->value)->toBe('failed')
            ->and($span->status->value)->toBe(sdkReportsFailures() ? 'failed' : 'incomplete')
            ->and($span->error_class)->toBe(sdkReportsFailures() ? RequestException::class : null);
    })->with('media calls');
});

describe('when the call fails', function () {
    it('is a failed trace of its own, timed and with its error, or left running before SDK 1.2.2', function (string $type) {
        fakeOpenAiMedia(500);

        expect(fn () => mediaCall($type))->toThrow(RequestException::class);
        $id = $this->sdk->sole(mediaStartEvent($type))->invocationId;
        Trail::flush();
        $trace = Trace::query()->sole();
        $span = Span::query()->sole();

        expect($trace->id)->toBe($id)
            ->and($span->output)->toBeNull()
            ->and($span->input_tokens)->toBeNull()
            ->and($span->cost)->toBeNull();

        if (sdkReportsFailures()) {
            expect($trace->status->value)->toBe('failed')
                ->and($trace->error_class)->toBe(RequestException::class)
                ->and($trace->error_source->value)->toBe('run')
                ->and($trace->error_http_status)->toBe(500)
                ->and($trace->duration_ms)->toBeFloat()
                ->and($span->status->value)->toBe('failed')
                ->and($span->issue_kind->value)->toBe('exception')
                ->and($span->duration_ms)->toBeFloat();
        } else {
            // Nothing names the failed call, so it is left for the sweep.
            expect($trace->status->value)->toBe('running')
                ->and($span->status->value)->toBe('running');
        }
    })->with('media calls');

    it('records the failed attempt and the attempt failover recovers with as separate traces', function (string $type) {
        fakeOpenAiMedia(429);
        fakeOpenAiMedia(host: 'second.openai.test');

        mediaCall($type, ['openai', 'second']);
        $ids = array_map(fn ($entry) => $entry->invocationId, $this->sdk->of(mediaStartEvent($type)));
        Trail::flush();

        expect($ids)->toHaveCount(2)
            ->and(Trace::query()->findOrFail($ids[1])->status->value)->toBe('completed');

        if (sdkReportsFailures()) {
            expect(Trace::query()->findOrFail($ids[0])->status->value)->toBe('failed')
                ->and(Trace::query()->findOrFail($ids[0])->issue_kind->value)->toBe('rate_limited')
                ->and(Span::query()->findOrFail($ids[0])->error_class)->toBe(RateLimitedException::class)
                ->and(Span::query()->where('status', 'running')->count())->toBe(0);
        } else {
            // A generic failover event cannot prove which call failed.
            expect(Trace::query()->findOrFail($ids[0])->status->value)->toBe('running');
        }
    })->with('media calls');

    it('does not reopen a failed call for a late completion with the same id', function () {
        if (! sdkReportsFailures()) {
            $this->markTestSkipped('Before SDK 1.2.2 a failed image call fires no event of its own.');
        }
        fakeOpenAiMedia(500);

        expect(fn () => mediaCall('image'))->toThrow(RequestException::class);
        $start = $this->sdk->sole(GeneratingImage::class)->event;
        Event::dispatch(new ImageGenerated($start->invocationId, $start->provider, $start->model, $start->prompt, new ImageResponse(collect([new GeneratedImage('', 'image/png')]), new ImageUsage(5, 1), new Meta('openai', $start->model))));
        Trail::flush();
        $span = Span::query()->sole();

        expect($span->status->value)->toBe('failed')
            ->and($span->input_tokens)->toBeNull()
            ->and($span->output)->toBeNull();
    });
});

it('lets every call return its result when every Trail listener throws', function (string $type) {
    fakeOpenAiMedia();
    Exceptions::fake();
    $this->app->instance(Recorder::class, new ThrowingRecorder($this->app, $this->app->make(CostCalculator::class)));

    expect(mediaCall($type))->not->toBeNull();

    Exceptions::assertReported(fn (RuntimeException $e) => $e->getMessage() === 'mediaStarting failed');
    Exceptions::assertReported(fn (TypeError $e) => $e->getMessage() === 'mediaCompleted failed');
})->with('media calls');

it('lets a failing call keep its own exception when every Trail listener throws', function (string $type) {
    fakeOpenAiMedia(500);
    Exceptions::fake();
    $this->app->instance(Recorder::class, new ThrowingRecorder($this->app, $this->app->make(CostCalculator::class)));

    expect(fn () => mediaCall($type))->toThrow(RequestException::class);

    if (sdkReportsFailures()) {
        Exceptions::assertReported(fn (TypeError $e) => $e->getMessage() === 'capabilityFailed failed');
    }
})->with('media calls');
