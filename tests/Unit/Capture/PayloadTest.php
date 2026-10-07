<?php

use Astro\Trail\Capture\Payload;
use Astro\Trail\Tests\Fixtures\Capture\PayloadPlain;
use Astro\Trail\Tests\Fixtures\Capture\Payloads;
use Astro\Trail\Tests\Fixtures\Capture\PayloadSuit;
use Illuminate\Contracts\Support\Arrayable;
use Illuminate\Http\UploadedFile;
use Laravel\Ai\Files\Audio;
use Laravel\Ai\Files\Document;
use Laravel\Ai\Files\Image;
use Laravel\Ai\Files\S3Document;
use Laravel\Ai\Files\Video;
use Laravel\Ai\Gateway\TextGenerationOptions;
use Laravel\Ai\Messages\AssistantMessage;
use Laravel\Ai\Messages\Message;
use Laravel\Ai\Messages\ToolResultMessage;
use Laravel\Ai\Messages\UserMessage;
use Laravel\Ai\Responses\Data\ToolCall;
use Laravel\Ai\Responses\Data\ToolResult;
use Laravel\Ai\ToolChoice;

it('keeps scalars and null as they are', function () {
    expect(Payloads::make()->value('text'))->toBe('text')
        ->and(Payloads::make()->value(3))->toBe(3)
        ->and(Payloads::make()->value(1.5))->toBe(1.5)
        ->and(Payloads::make()->value(false))->toBeFalse()
        ->and(Payloads::make()->value(null))->toBeNull()
        ->and(Payloads::make()->value(INF))->toBeNull()
        ->and(Payloads::make()->value(NAN))->toBeNull();
});

it('recurses into nested arrays, keeping their keys', function () {
    $value = ['a' => [1, ['b' => new class implements Stringable
    {
        public function __toString(): string
        {
            return 'deep';
        }
    }]], 5 => PayloadSuit::Hearts];

    expect(Payloads::make()->value($value))->toBe(['a' => [1, ['b' => 'deep']], 5 => 'hearts']);
});

it('turns Stringable, JsonSerializable, Arrayable and enums into plain values', function () {
    $json = new class implements JsonSerializable
    {
        public function jsonSerialize(): mixed
        {
            return ['when' => PayloadSuit::Hearts, 'nested' => new ArrayObject([1])];
        }
    };

    $arrayable = new class implements Arrayable
    {
        public function toArray(): array
        {
            return ['x' => 1];
        }
    };

    expect(Payloads::make()->value($json))->toBe(['when' => 'hearts', 'nested' => ['class' => 'ArrayObject']])
        ->and(Payloads::make()->value($arrayable))->toBe(['x' => 1])
        ->and(Payloads::make()->value(PayloadSuit::Hearts))->toBe('hearts');
});

it('stores only the class of any other object, never its state or an anonymous class path', function () {
    $secret = new class
    {
        public string $token = 'secret';
    };

    expect(Payloads::make()->value(new DateTimeImmutable))->toBe(['class' => DateTimeImmutable::class])
        ->and(Payloads::make()->value(PayloadPlain::One))->toBe(['class' => PayloadPlain::class])
        ->and(Payloads::make()->value($secret))->toBe(['class' => 'class@anonymous'])
        ->and(json_encode(Payloads::make()->value($secret)))->not->toContain('secret');
});

it('drops closures and resources', function () {
    $resource = fopen('php://memory', 'r');

    expect(Payloads::make()->value(fn () => 1))->toBeNull()
        ->and(Payloads::make()->value($resource))->toBeNull()
        ->and(Payloads::make()->value(['keep' => 1, 'closure' => fn () => 1, 'resource' => $resource]))->toBe(['keep' => 1, 'closure' => null, 'resource' => null]);

    fclose($resource);
});

it('stops at 32 levels instead of recursing forever', function () {
    $deep = 'leaf';

    for ($level = 0; $level < 40; $level++) {
        $deep = [$deep];
    }

    $captured = Payloads::make()->value($deep);
    $levels = 0;

    while (is_array($captured)) {
        $captured = $captured[0];
        $levels++;
    }

    expect($captured)->toBeNull()->and($levels)->toBe(32);
});

it('cuts a cycle where it closes', function () {
    $cycle = new class implements JsonSerializable
    {
        public function jsonSerialize(): mixed
        {
            return [$this];
        }
    };

    expect(Payloads::make()->value($cycle))->toBe([['class' => 'JsonSerializable@anonymous']]);
});

it('does not fan out exponentially through an object that returns itself twice', function () {
    $fan = new class implements JsonSerializable
    {
        public function jsonSerialize(): mixed
        {
            return [$this, $this];
        }
    };

    $started = hrtime(true);
    $captured = Payloads::make()->value($fan);

    expect($captured)->toBe([['class' => 'JsonSerializable@anonymous'], ['class' => 'JsonSerializable@anonymous']])
        ->and((hrtime(true) - $started) / 1e9)->toBeLessThan(1.0);
});

it('stops at a node budget on a very wide value', function () {
    $captured = Payloads::make()->value(array_fill(0, 25_000, 'x'));

    $kept = count(array_filter($captured, fn ($item) => $item === 'x'));

    expect($captured)->toHaveCount(25_000)
        ->and($kept)->toBeGreaterThan(9_000)->toBeLessThanOrEqual(10_000)
        ->and($captured[24_999])->toBeNull();
});

it('does not share a budget between calls', function () {
    Payloads::make()->value(array_fill(0, 25_000, 'x'));

    expect(Payloads::make()->value(['a', 'b']))->toBe(['a', 'b']);
});

it('stores the class of an object whose own methods throw', function () {
    $json = new class implements JsonSerializable
    {
        public function jsonSerialize(): mixed
        {
            throw new RuntimeException('boom');
        }
    };

    $arrayable = new class implements Arrayable
    {
        public function toArray(): array
        {
            throw new RuntimeException('boom');
        }
    };

    $stringable = new class implements Stringable
    {
        public function __toString(): string
        {
            throw new RuntimeException('boom');
        }
    };

    expect(Payloads::make()->value([$json, $arrayable, $stringable]))->toBe([['class' => 'JsonSerializable@anonymous'], ['class' => 'Illuminate\\Contracts\\Support\\Arrayable@anonymous'], ['class' => 'Stringable@anonymous']]);
});

it('stores a model-like object as a structure, not as its JSON string', function () {
    $model = new class implements Arrayable, JsonSerializable, Stringable
    {
        public function toArray(): array
        {
            return ['id' => 1];
        }

        public function jsonSerialize(): mixed
        {
            return $this->toArray();
        }

        public function __toString(): string
        {
            return '{"id":1}';
        }
    };

    expect(Payloads::make()->value($model))->toBe(['id' => 1])
        ->and(Payloads::make()->value(collect(['a' => 1])))->toBe(['a' => 1]);
});

it('captures messages with their tool calls and results, and attachments as descriptions', function () {
    $messages = [
        new UserMessage('Hi', [new stdClass, new stdClass]),
        new AssistantMessage('', collect([new ToolCall('call_1', 'lookup', ['query' => 'x'], reasoningEncryptedContent: 'opaque')])),
        new ToolResultMessage(collect([new ToolResult('call_1', 'lookup', ['query' => 'x'], 'found')])),
        new Message('assistant', 'Done'),
    ];

    expect(Payloads::make()->messages($messages))->toBe([
        ['role' => 'user', 'content' => 'Hi', 'attachments' => [['type' => 'std-class', 'name' => null, 'size' => null], ['type' => 'std-class', 'name' => null, 'size' => null]]],
        ['role' => 'assistant', 'content' => '', 'tool_calls' => [['id' => 'call_1', 'name' => 'lookup', 'arguments' => ['query' => 'x']]]],
        ['role' => 'tool_result', 'content' => null, 'tool_results' => [['id' => 'call_1', 'name' => 'lookup', 'result' => 'found']]],
        ['role' => 'assistant', 'content' => 'Done'],
    ]);
});

it('captures generation options from public properties only', function () {
    $options = new TextGenerationOptions(
        maxSteps: 5,
        maxTokens: 100,
        temperature: 0.2,
        topP: 0.9,
        toolChoice: ToolChoice::tool('lookup'),
        providerOptions: ['thinking' => ['budget' => 10]],
    );

    expect(Payloads::make()->options($options))->toBe([
        'max_steps' => 5,
        'max_tokens' => 100,
        'temperature' => 0.2,
        'top_p' => 0.9,
        'tool_choice' => ['mode' => 'tool', 'tool' => 'lookup'],
        'provider_options' => ['thinking' => ['budget' => 10]],
    ])->and(Payloads::make()->options(null))->toBeNull()
        ->and(Payloads::make()->options(new TextGenerationOptions)['tool_choice'])->toBeNull();
});

describe('redaction by key', function () {
    it('replaces the whole value under a configured key, at any depth', function () {
        $captured = Payloads::make()->capture(['user' => ['name' => 'Ada', 'password' => 'hunter2', 'profile' => ['api_key' => ['nested' => 'secret value']]], 'list' => [['token' => 'abc']]], 'input');

        expect($captured->value)->toBe([
            'user' => ['name' => 'Ada', 'password' => '[redacted]', 'profile' => ['api_key' => '[redacted]']],
            'list' => [['token' => '[redacted]']],
        ])->and($captured->redacted)->toBeTrue();
    });

    it('ignores case, dashes, underscores and spaces in a key', function (string $key) {
        expect(Payloads::make()->capture([$key => 'value'])->value)->toBe([$key => '[redacted]']);
    })->with(['PASSWORD', 'Api-Key', 'api key', 'X_API_KEY', 'x-api-key', 'Access_Token', 'set-cookie']);

    it('matches a key exactly, never by substring', function (string $key) {
        $captured = Payloads::make()->capture([$key => 'value']);

        expect($captured->value)->toBe([$key => 'value'])->and($captured->redacted)->toBeFalse();
    })->with(['input_tokens', 'output_tokens', 'tokens', 'token_count', 'passwords', 'secretary', 'authorization_url', 'cookies']);

    it('redacts a value that is an object, and leaves a null alone', function () {
        $captured = Payloads::make()->capture(['secret' => new ArrayObject(['a' => 1]), 'token' => null]);

        expect($captured->value)->toBe(['secret' => '[redacted]', 'token' => null]);
    });

    it('uses the keys it is given', function () {
        $payload = Payloads::make(keys: ['ssn']);

        expect($payload->capture(['ssn' => '123', 'password' => 'kept'])->value)->toBe(['ssn' => '[redacted]', 'password' => 'kept']);
    });

    it('does nothing when redaction is turned off', function () {
        $captured = Payloads::make(redaction: false)->capture(['password' => 'hunter2', 'text' => 'Bearer abcdefghijklmnopqrstuvwxyz']);

        expect($captured->value)->toBe(['password' => 'hunter2', 'text' => 'Bearer abcdefghijklmnopqrstuvwxyz'])->and($captured->redacted)->toBeFalse();
    });
});

describe('redaction by pattern', function () {
    dataset('secrets', [
        'a bearer token' => ['Bearer abcdefghijklmnop1234567890xyz'],
        'an OpenAI key' => ['sk-abcdefghijklmnopqrstuvwxyz0123456789ABCD'],
        'an Anthropic key' => ['sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcd'],
        'a project key' => ['sk-proj-abcdEFGH1234_ijklMNOP5678-qrstUVWX'],
        'a Stripe key' => ['sk_live_abcdefghijklmnop1234'],
        'a GitHub personal token' => ['ghp_abcdefghijklmnopqrstuvwxyz0123456789'],
        'a GitHub oauth token' => ['gho_abcdefghijklmnopqrstuvwxyz0123456789'],
        'a GitHub server token' => ['ghs_abcdefghijklmnopqrstuvwxyz0123456789'],
        'a GitHub fine grained token' => ['github_pat_11ABCDEFG0abcdefghijkl_mnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef'],
        'a Slack bot token' => ['xoxb-1234567890-abcdefghijkl'],
        'a Slack app token' => ['xapp-1-A0123456789-abcdefghijkl'],
        'a Google key' => ['AIzaSyA1234567890abcdefghijklmnopqrstuv'],
        'an AWS access key id' => ['AKIAIOSFODNN7EXAMPLE'],
        'an AWS temporary key id' => ['ASIAIOSFODNN7EXAMPLE'],
        'an AWS secret key with its label' => ['aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'],
        'a JSON web token' => ['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r'],
        'a private key block' => ["-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA7\nabc123==\n-----END RSA PRIVATE KEY-----"],
    ]);

    it('replaces the secret and nothing around it', function (string $text) {
        $captured = Payloads::make()->capture("before {$text} after");

        expect($captured->value)->toBe('before [redacted] after')
            ->and($captured->redacted)->toBeTrue();
    })->with('secrets');

    it('redacts a private key block that was cut short, through to the end of the text', function () {
        expect(Payloads::make()->capture("before -----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC")->value)->toBe('before [redacted]');
    });

    it('leaves ordinary text alone', function (string $text) {
        $captured = Payloads::make()->capture($text);

        expect($captured->value)->toBe($text)->and($captured->redacted)->toBeFalse();
    })->with([
        'prose about tokens' => ['The bearer of this letter should present the token at the desk.'],
        'a short bearer' => ['Bearer shortvalue'],
        'a library name' => ['We use sk-learn-pipeline-configuration for modelling.'],
        'a risk word' => ['risk-assessment-framework-2024-overview'],
        'a UUID' => ['01a11594-ef63-731d-a3fa-c287cc415461'],
        'a git SHA' => ['commit 3f786850e387550fdab836ed7e6dc881de23001b'],
        'a base64 image fragment' => ['iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='],
        'an AWS word' => ['aws secret keys are rotated monthly by the platform team'],
        'a date' => ['2026-10-07T12:00:00Z'],
        'a short eyJ' => ['eyJhbGciOiJIUzI1NiJ9'],
    ]);

    it('applies the patterns it is given, in place of the defaults', function () {
        $payload = Payloads::make(patterns: ['/\bACME-\d{4}\b/']);

        expect($payload->capture('ticket ACME-1234 and sk-abcdefghijklmnopqrstuvwxyz0123456789')->value)
            ->toBe('ticket [redacted] and sk-abcdefghijklmnopqrstuvwxyz0123456789');
    });

    it('scrubs strings at any depth, and leaves string keys alone', function () {
        $captured = Payloads::make()->capture(['a' => ['b' => ['AKIAIOSFODNN7EXAMPLE' => 'AKIAIOSFODNN7EXAMPLE']]]);

        expect($captured->value)->toBe(['a' => ['b' => ['AKIAIOSFODNN7EXAMPLE' => '[redacted]']]]);
    });

    it('keeps the default lists in the config file in step with the built-in defaults', function () {
        $config = require __DIR__.'/../../../config/trail.php';

        expect($config['redaction']['keys'])->toBe(Payload::DEFAULT_KEYS)
            ->and($config['redaction']['patterns'])->toBe(Payload::DEFAULT_PATTERNS);
    });
});

describe('a pattern that fails at run time', function () {
    it('redacts the whole string when a pattern fails on it, never storing it unscanned', function () {
        $backtrack = ini_get('pcre.backtrack_limit');
        $jit = ini_get('pcre.jit');
        ini_set('pcre.jit', '0');
        ini_set('pcre.backtrack_limit', '1000');

        try {
            $payload = Payloads::make(patterns: ['/^(a+)+$/']);
            $captured = $payload->capture(['safe' => 'short', 'bad' => str_repeat('a', 40).'b']);
        } finally {
            ini_set('pcre.backtrack_limit', (string) $backtrack);
            ini_set('pcre.jit', (string) $jit);
        }

        expect($captured->value)->toBe(['safe' => 'short', 'bad' => '[redacted]'])
            ->and($captured->redacted)->toBeTrue();
    });
});

describe('truncation', function () {
    it('cuts a long string to the limit and records its original length under its path', function () {
        $captured = Payloads::make(maxLength: 10)->capture(['messages' => [['content' => 'short'], ['content' => str_repeat('x', 25)]]], 'input');

        expect($captured->value['messages'][1]['content'])->toBe(str_repeat('x', 10))
            ->and($captured->value['messages'][0]['content'])->toBe('short')
            ->and($captured->truncated)->toBe(['input.messages.1.content' => 25]);
    });

    it('cuts a top-level string at its own path', function () {
        $captured = Payloads::make(maxLength: 5)->capture('abcdefghij', 'error_message');

        expect($captured->value)->toBe('abcde')->and($captured->truncated)->toBe(['error_message' => 10]);
    });

    it('cuts by characters and never inside a multibyte sequence', function () {
        $emoji = str_repeat('😀', 8);
        $combining = "e\u{0301}e\u{0301}e\u{0301}e\u{0301}";

        $cutEmoji = Payloads::make(maxLength: 5)->capture($emoji);
        $cutCombining = Payloads::make(maxLength: 3)->capture($combining);

        expect($cutEmoji->value)->toBe(str_repeat('😀', 5))
            ->and($cutEmoji->truncated)->toBe(['' => 8])
            ->and(mb_check_encoding($cutEmoji->value, 'UTF-8'))->toBeTrue()
            ->and(mb_check_encoding($cutCombining->value, 'UTF-8'))->toBeTrue()
            ->and(mb_strlen($cutCombining->value))->toBe(3)
            ->and($cutCombining->truncated)->toBe(['' => 8]);
    });

    it('keeps everything when there is no limit', function () {
        $captured = Payloads::make(maxLength: null)->capture(str_repeat('x', 50_000));

        expect(strlen($captured->value))->toBe(50_000)->and($captured->truncated)->toBe([]);
    });

    it('redacts before it truncates, so a secret straddling the cut cannot survive', function () {
        $secret = 'sk-abcdefghijklmnopqrstuvwxyz0123456789ABCD';
        // The cut at 20 characters would leave 10 characters of the key: too short for any pattern.
        $text = str_repeat('x', 9).' '.$secret.' tail';

        $captured = Payloads::make(maxLength: 20)->capture($text);

        expect($captured->value)->toBe(str_repeat('x', 9).' [redacted]')
            ->and($captured->value)->not->toContain('sk-')
            ->and($captured->redacted)->toBeTrue()
            ->and($captured->truncated)->toBe(['' => 25]);
    });
});

describe('what is not captured', function () {
    it('stores nothing when capture is off', function () {
        $captured = Payloads::make(capture: false)->capture(['a' => 'b'], 'input');

        expect($captured->value)->toBeNull()
            ->and(Payloads::make(capture: false)->capturing())->toBeFalse();
    });

    it('still keeps a message when capture is off, redacted and truncated', function () {
        $captured = Payloads::make(capture: false, maxLength: 25)->message('failed with Bearer abcdefghijklmnop1234567890 and more', 'error_message');

        expect($captured->value)->toBe('failed with [redacted] an')->and($captured->redacted)->toBeTrue()->and($captured->truncated)->toBe(['error_message' => 31]);
    });

    it('does not read the system prompt when it is off, or when capture is off', function () {
        expect(Payloads::make(systemPrompt: false)->capturesSystemPrompt())->toBeFalse()
            ->and(Payloads::make(capture: false)->capturesSystemPrompt())->toBeFalse()
            ->and(Payloads::make()->capturesSystemPrompt())->toBeTrue();
    });

    it('describes a string that is not text by its size', function () {
        $captured = Payloads::make()->capture(['file' => "\xff\xfe\x00binary", 'text' => 'fine']);

        expect($captured->value)->toBe(['file' => ['binary' => true, 'bytes' => 9], 'text' => 'fine']);
    });
});

describe('attachments', function () {
    it('describes each kind without reading or fetching it', function () {
        $payload = Payloads::make();
        $missing = '/no/such/file/'.uniqid().'.png';

        $described = $payload->attachments([
            Image::fromBase64(base64_encode(str_repeat('a', 100)), 'image/png')->as('photo.png'),
            Image::fromBase64(base64_encode('abcd')),
            Document::fromString('hello world', 'text/plain'),
            Image::fromPath($missing),
            Image::fromUrl('https://example.test/files/cat.jpg?sig=secret'),
            Document::fromStorage('reports/q3.pdf', 'local'),
            Document::fromId('file_123'),
            new S3Document('s3://bucket/contracts/nda.pdf'),
            Audio::fromBase64(base64_encode('sound'), 'audio/mpeg'),
            Video::fromUrl('https://example.test/clip.mp4'),
            UploadedFile::fake()->create('notes.txt', 3),
            new stdClass,
        ]);

        expect($described)->toBe([
            ['type' => 'base64-image', 'name' => 'photo.png', 'size' => 100],
            ['type' => 'base64-image', 'name' => null, 'size' => 4],
            ['type' => 'base64-document', 'name' => null, 'size' => 11],
            ['type' => 'local-image', 'name' => basename($missing), 'size' => null],
            ['type' => 'remote-image', 'name' => 'cat.jpg', 'size' => null],
            ['type' => 'stored-document', 'name' => 'q3.pdf', 'size' => null],
            ['type' => 'provider-document', 'name' => null, 'size' => null],
            ['type' => 's3-document', 'name' => 'nda.pdf', 'size' => null],
            ['type' => 'base64-audio', 'name' => null, 'size' => 5],
            ['type' => 'remote-video', 'name' => 'clip.mp4', 'size' => null],
            ['type' => 'upload', 'name' => 'notes.txt', 'size' => 3072],
            ['type' => 'std-class', 'name' => null, 'size' => null],
        ]);
    });
});

describe('cost', function () {
    it('captures a megabyte string and a long history quickly', function () {
        $payload = Payloads::make();

        $started = hrtime(true);
        $big = $payload->capture(['text' => str_repeat('lorem ipsum dolor sit amet ', 40_000)], 'input');
        $history = $payload->capture(array_map(fn (int $i) => ['role' => 'user', 'content' => "message number {$i} with some words in it"], range(1, 5_000)), 'input');
        $seconds = (hrtime(true) - $started) / 1e9;

        expect($big->truncated)->toHaveKey('input.text')
            ->and($history->truncated)->toBe([])
            ->and($seconds)->toBeLessThan(1.0);
    });
});
