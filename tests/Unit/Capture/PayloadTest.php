<?php

use Astro\Trail\Capture\Captured;
use Astro\Trail\Capture\Payload;
use Astro\Trail\Capture\SpanDraft;
use Astro\Trail\Enums\SpanType;
use Astro\Trail\Enums\Status;
use Astro\Trail\Tests\Fixtures\Capture\Hostile;
use Astro\Trail\Tests\Fixtures\Capture\PatternCases;
use Astro\Trail\Tests\Fixtures\Capture\PayloadPlain;
use Astro\Trail\Tests\Fixtures\Capture\Payloads;
use Astro\Trail\Tests\Fixtures\Capture\PayloadSuit;
use Astro\Trail\Tests\Fixtures\Capture\Secrets;
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

    it('scrubs strings at any depth', function () {
        $captured = Payloads::make()->capture(['a' => ['b' => ['note' => 'AKIAIOSFODNN7EXAMPLE', 'list' => ['x', 'use sk-'.str_repeat('x', 30)]]]]);

        expect($captured->value)->toBe(['a' => ['b' => ['note' => '[redacted]', 'list' => ['x', 'use [redacted]']]]]);
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

describe('key names', function () {
    it('redacts the value under every name that holds a secret', function (string $key) {
        $captured = Payloads::make()->capture([$key => 'plainvalue']);

        expect($captured->value)->toBe([$key => '[redacted]'])->and($captured->redacted)->toBeTrue();
    })->with([
        'password', 'DB_PASSWORD', 'user_password', 'passwd', 'pwd', 'DB_PWD', 'passphrase', 'ssh_passphrase', 'password_confirmation', 'new-password-confirmation',
        'secret', 'client_secret', 'api_secret', 'APP_SECRET', 'secret_key', 'STRIPE_SECRET_KEY', 'secret_access_key', 'aws_secret_access_key', 'AWS_SECRET_ACCESS_KEY',
        'access_key', 'azure_storage_access_key', 'api_key', 'apikey', 'OPENAI_API_KEY', 'x-api-key', 'X_API_KEY', 'private_key', 'ssh private key',
        'token', 'access_token', 'refresh_token', 'id_token', 'session_token', 'GITHUB_TOKEN', 'x_auth_token',
        'authorization', 'Proxy-Authorization', 'cookie', 'Set-Cookie', 'credentials',
    ]);

    it('leaves the value under a name that is not a secret', function (string $key) {
        $captured = Payloads::make()->capture([$key => 'plainvalue']);

        expect($captured->value)->toBe([$key => 'plainvalue'])->and($captured->redacted)->toBeFalse();
    })->with([
        'input_tokens', 'output_tokens', 'max_tokens', 'token_count', 'cache_read_tokens', 'cache_creation_input_tokens', 'tokens', 'tokenizer',
        'password_reset_url', 'passwords', 'secretary', 'secrets', 'authorization_url', 'cookies', 'credentials_path',
        'aws_access_key_id', 'access_key_id', 'public_key', 'keyboard', 'monkey', 'name', 'cwd', 'description',
    ]);

    it('matches a name with a * only at its end, and only for entries that start with one', function () {
        $payload = Payloads::make(keys: ['*word', 'exact']);

        expect($payload->capture(['password' => 'a', 'sword' => 'b', 'words' => 'c', 'exact' => 'd', 'inexact' => 'e', 'EXACT' => 'f'])->value)
            ->toBe(['password' => '[redacted]', 'sword' => '[redacted]', 'words' => 'c', 'exact' => '[redacted]', 'inexact' => 'e', 'EXACT' => '[redacted]']);
    });
});

describe('keys inside text', function () {
    it('redacts the value, and only the value, in the quoted key forms', function (string $text, string $expected) {
        $captured = Payloads::make()->capture($text);

        expect($captured->value)->toBe($expected)->and($captured->redacted)->toBeTrue();
    })->with([
        'json' => ['{"password":"hunter2","api_key":"plainvalue","name":"Ada"}', '{"password":"[redacted]","api_key":"[redacted]","name":"Ada"}'],
        'spaces' => ['{"password" : "hunter2" , "name": "Ada"}', '{"password" : "[redacted]" , "name": "Ada"}'],
        'single quotes' => ["{'password': 'hunter2', 'user': 'ada'}", "{'password': '[redacted]', 'user': 'ada'}"],
        'escaped quotes' => ['{\"password\":\"hunter2\",\"user\":\"ada\"}', '{\"password\":\"[redacted]\",\"user\":\"ada\"}'],
        'an env style name' => ['{"OPENAI_API_KEY":"abc","DB_PASSWORD":"p w"}', '{"OPENAI_API_KEY":"[redacted]","DB_PASSWORD":"[redacted]"}'],
        'separators and case' => ['{"Api-Key":"abc","SECRET KEY":"def"}', '{"Api-Key":"[redacted]","SECRET KEY":"[redacted]"}'],
        'an escaped quote inside the value' => ['{"password":"a\"b c","name":"Ada"}', '{"password":"[redacted]","name":"Ada"}'],
        'an escaped quote inside an escaped value' => ['{\"password\":\"a\\\\\"b\",\"name\":\"Ada\"}', '{\"password\":\"[redacted]\",\"name\":\"Ada\"}'],
        'nested' => ['{"data":{"user":{"token":"abc123"}},"ok":true}', '{"data":{"user":{"token":"[redacted]"}},"ok":true}'],
        'a value cut short' => ['{"password":"unterminated', '{"password":"[redacted]'],
        'the aws secret as a bare value' => ['{"secret_access_key":"wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY","region":"eu"}', '{"secret_access_key":"[redacted]","region":"eu"}'],
    ]);

    it('leaves quoted keys that are not secrets, and values that are not strings', function (string $text) {
        $captured = Payloads::make()->capture($text);

        expect($captured->value)->toBe($text)->and($captured->redacted)->toBeFalse();
    })->with([
        'a counter' => ['{"input_tokens":"5","tokens":"x","token_count":"3"}'],
        'a url name' => ['{"password_reset_url":"https://example.com/reset"}'],
        'a word as a value' => ['{"name":"password","kind":"token"}'],
        'an empty value' => ['{"password":""}'],
        'null' => ['{"password":null}'],
        'a number' => ['{"password":12345}'],
        'prose' => ['The password: hunter2 was shared, and so was password=hunter2.'],
        'a key with no colon' => ['"password" is a word, "token" too'],
    ]);

    it('uses the keys it is given', function () {
        $payload = Payloads::make(keys: ['ssn', '*pin']);

        expect($payload->capture('{"ssn":"123","new_pin":"9","password":"kept"}')->value)->toBe('{"ssn":"[redacted]","new_pin":"[redacted]","password":"kept"}')
            ->and(Payloads::make(keys: [])->capture('{"password":"kept"}')->value)->toBe('{"password":"kept"}');
    });

    it('does nothing when redaction is turned off', function () {
        expect(Payloads::make(redaction: false)->capture('{"password":"hunter2"}')->value)->toBe('{"password":"hunter2"}');
    });
});

describe('array keys', function () {
    it('are scrubbed like any string, so a secret used as a key is not stored', function () {
        $captured = Payloads::make()->capture([Secrets::PROMPT => 'user 1', 'plain' => 'user 2'], 'input');

        expect($captured->value)->toBe(['[redacted]' => 'user 1', 'plain' => 'user 2'])
            ->and($captured->redacted)->toBeTrue()
            ->and(json_encode($captured->value))->not->toContain('sk-ant');
    });

    it('keep both keys when scrubbing makes them equal', function () {
        $captured = Payloads::make()->capture([Secrets::PROMPT => 'one', Secrets::RESULT => 'two', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789' => 'three', 'other' => 'four']);

        expect($captured->value)->toBe(['[redacted]' => 'one', '[redacted]#2' => 'two', '[redacted]#3' => 'three', 'other' => 'four']);
    });

    it('do not collide with a key that already has the suffix', function () {
        $captured = Payloads::make()->capture([Secrets::PROMPT => 'one', '[redacted]#2' => 'real', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789' => 'three']);

        expect($captured->value)->toBe(['[redacted]' => 'one', '[redacted]#2' => 'real', '[redacted]#3' => 'three']);
    });

    it('leave the path of a truncated value free of the secret', function () {
        $captured = Payloads::make(maxLength: 5)->capture(['users' => [Secrets::PROMPT => str_repeat('x', 20)]], 'input');

        expect($captured->value)->toBe(['users' => ['[redacted]' => 'xxxxx']])
            ->and($captured->truncated)->toBe(['input.users.[redacted]' => 20]);
    });

    it('are cut when very long, and the cut is flagged without a length', function () {
        $captured = Payloads::make()->capture([str_repeat('k', 300) => 1, str_repeat('k', 400) => 2, 'short' => 3]);

        expect(array_keys($captured->value))->toBe([str_repeat('k', 256), str_repeat('k', 256).'#2', 'short'])
            ->and($captured->dropped)->toBeTrue()
            ->and($captured->truncated)->toBe([]);
    });

    it('are redacted before they are cut, so a secret on the cut cannot survive', function () {
        $key = str_repeat('x', 250).' '.Secrets::PROMPT;
        $captured = Payloads::make()->capture([$key => 1]);

        expect(array_keys($captured->value))->toBe([str_repeat('x', 250).' [reda'])
            ->and(json_encode($captured->value))->not->toContain('sk-');
    });

    it('that are not text are never stored', function () {
        $captured = Payloads::make()->capture(["bad\xff\xfekey" => 1, 'good' => 2]);

        expect($captured->value)->toBe(['[redacted]' => 1, 'good' => 2])->and($captured->redacted)->toBeTrue();
    });

    it('stay as they are when they hold nothing', function () {
        $captured = Payloads::make()->capture([0 => 'a', 7 => 'b', 'name' => 'c', '' => 'd']);

        expect($captured->value)->toBe([0 => 'a', 7 => 'b', 'name' => 'c', '' => 'd'])->and($captured->dropped)->toBeFalse();
    });
});

describe('what a pattern touches', function () {
    it('has a case for every default pattern, in order', function () {
        expect(PatternCases::all())->toHaveCount(count(Payload::DEFAULT_PATTERNS));
    });

    it('replaces what it should and nothing else', function () {
        foreach (PatternCases::all() as $index => $case) {
            $pattern = Payload::DEFAULT_PATTERNS[$index];

            foreach ($case['positives'] as $text => $expected) {
                expect(preg_replace($pattern, Payload::REDACTED, (string) $text))->toBe($expected, "{$case['name']} should redact: {$text}");
            }

            foreach ($case['negatives'] as $text) {
                expect(preg_replace($pattern, Payload::REDACTED, $text))->toBe($text, "{$case['name']} should leave alone: {$text}");
            }
        }
    });

    it('leaves ordinary content alone, under every pattern and under the whole of redaction', function (string $text) {
        foreach (Payload::DEFAULT_PATTERNS as $pattern) {
            expect(preg_replace($pattern, Payload::REDACTED, $text))->toBe($text, "{$pattern} changed ordinary content");
        }

        $captured = Payloads::make()->capture($text);

        expect($captured->value)->toBe($text)->and($captured->redacted)->toBeFalse();
    })->with(PatternCases::ordinary());

    it('redacts a bare secret under a key made for it, with the whole of redaction', function (string $text) {
        $captured = Payloads::make()->capture($text);

        expect($captured->value)->toContain('[redacted]')->and($captured->redacted)->toBeTrue();
    })->with([
        'a provider key with no digit' => ['sk-proj-'.'abcdefghijklmnopqrstuvwxyzabcdefghijklmn'],
        'an escaped private key' => ['"-----BEGIN PRIVATE KEY-----\\nMIIE\\nabc'],
    ]);

    it('redacts a bare 40 character AWS secret stored under its key', function () {
        $captured = Payloads::make()->capture(['aws_secret_access_key' => 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY']);

        expect($captured->value)->toBe(['aws_secret_access_key' => '[redacted]']);
    });
});

describe('linear time', function () {
    // PHP compiles a pattern once and keeps it with the JIT setting of the moment, so each run
    // compiles patterns of its own, made different from every other run by a comment.
    beforeEach(function () {
        $this->fresh = fn (string $pattern, string $tag): string => '/(?#'.$tag.')'.substr($pattern, 1);
    });

    it('scans the worst text a user can send in linear time, with every default pattern', function (string $jit) {
        $before = ini_get('pcre.jit');
        ini_set('pcre.jit', $jit);
        $slow = [];
        $tag = 'jit'.$jit.uniqid();

        try {
            $patterns = array_map(fn (string $pattern): string => ($this->fresh)($pattern, $tag), Payload::DEFAULT_PATTERNS);
            $payload = Payloads::make(maxLength: null, keys: [...Payload::DEFAULT_KEYS, $tag], patterns: $patterns);

            foreach (Hostile::inputs(1_000_000) as $name => $text) {
                // A pattern that is quadratic would take minutes on the full text, so a tenth of it is tried first.
                $started = hrtime(true);

                foreach ($patterns as $pattern) {
                    preg_replace($pattern, Payload::REDACTED, substr($text, 0, 100_000));
                }

                // Generous bounds: a shared CI runner is several times slower, and a quadratic pattern misses them by far.
                if ((hrtime(true) - $started) / 1e9 > 1.0) {
                    $slow[] = "{$name}: not linear, a tenth of it already takes ".round((hrtime(true) - $started) / 1e9, 2).'s';

                    continue;
                }

                $started = hrtime(true);

                foreach ($patterns as $pattern) {
                    if (preg_replace($pattern, Payload::REDACTED, $text) === null) {
                        $slow[] = "{$name}: ".preg_last_error_msg();
                    }
                }

                $withPatterns = (hrtime(true) - $started) / 1e9;

                $started = hrtime(true);
                $payload->capture($text);
                $withAll = (hrtime(true) - $started) / 1e9;

                if ($withPatterns > 4.0 || $withAll > 4.0) {
                    $slow[] = sprintf('%s: %.2fs with the patterns, %.2fs with all of redaction', $name, $withPatterns, $withAll);
                }
            }
        } finally {
            ini_set('pcre.jit', (string) $before);
        }

        expect($slow)->toBe([]);
    })->with(['jit on' => '1', 'jit off' => '0']);

    it('bounds the work for a pattern the application configured, however long the text', function (string $jit) {
        $before = ini_get('pcre.jit');
        ini_set('pcre.jit', $jit);

        try {
            // The provider key pattern as it used to be: two unbounded lookaheads from every start.
            $quadratic = ($this->fresh)('/\b(?:sk|pk|rk)-(?=[A-Za-z0-9_\-]{20,})(?=[A-Za-z0-9_\-]*\d)[A-Za-z0-9_\-]+/', 'bound'.$jit.uniqid());
            $payload = Payloads::make(maxLength: 100, patterns: [$quadratic]);

            $started = hrtime(true);
            $captured = $payload->capture(str_repeat('sk-', 40_000));
            $seconds = (hrtime(true) - $started) / 1e9;
        } finally {
            ini_set('pcre.jit', (string) $before);
        }

        expect($seconds)->toBeLessThan(1.0)
            ->and($captured->truncated)->toBe(['' => 120_000])
            ->and(mb_strlen($captured->value))->toBe(100);
    })->with(['jit on' => '1', 'jit off' => '0']);
});

describe('redaction before the cut, within a window', function () {
    it('redacts a secret that starts just before the cut and is longer than what is stored of it', function () {
        // The cut at 20 characters leaves 2 characters of a key that is 44 long.
        $captured = Payloads::make(maxLength: 20)->capture(str_repeat('x', 17).' '.Secrets::PROMPT.' tail');

        expect($captured->value)->toBe(str_repeat('x', 17).' [r')
            ->and($captured->truncated)->toBe(['' => 17 + 1 + 10 + 5])
            ->and($captured->redacted)->toBeTrue();
    });

    it('redacts a secret that ends inside the window past the cut', function () {
        $secret = 'sk-'.str_repeat('Ab3', 700);
        $captured = Payloads::make(maxLength: 20)->capture(str_repeat('x', 15).' '.$secret.' tail');

        expect($captured->value)->toBe(str_repeat('x', 15).' [red')
            ->and(json_encode($captured))->not->toContain('Ab3Ab3');
    });

    it('redacts a private key block that starts before the cut and is far longer than the window', function () {
        $block = "-----BEGIN PRIVATE KEY-----\n".chunk_split(str_repeat('MIIEvQIBADANBgkqhkiG9w0BAQEFAASC', 600), 64).'-----END PRIVATE KEY-----';
        $captured = Payloads::make(maxLength: 30)->capture('key: '.$block.' and then some text');

        expect($captured->value)->toBe('key: [redacted]')
            ->and($captured->truncated[''])->toBeGreaterThan(30);
    });

    it('records the length of the whole string, not of the window', function () {
        $text = str_repeat('y', 9).' '.Secrets::PROMPT.' '.str_repeat('z', 200_000);
        $captured = Payloads::make(maxLength: 20)->capture($text);

        // The length the string has once redacted.
        expect($captured->truncated)->toBe(['' => strlen($text) - strlen(Secrets::PROMPT) + 10])
            ->and($captured->value)->toBe(str_repeat('y', 9).' [redacted]');
    });

    it('scans the whole string when there is no limit', function () {
        $text = str_repeat('x', 100_000).' '.Secrets::PROMPT;
        $captured = Payloads::make(maxLength: null)->capture($text);

        expect($captured->value)->toBe(str_repeat('x', 100_000).' [redacted]');
    });

    it('does not count a string that fits as cut, even when redaction makes it longer', function () {
        $captured = Payloads::make(maxLength: 12)->capture('a Bearer abcdefghijklmnop1234');

        expect($captured->value)->toBe('a [redacted]')->and($captured->truncated)->toBe([]);
    });
});

describe('the budget of a field', function () {
    it('drops the strings that come after a hundred times the limit, and says so', function () {
        $captured = Payloads::make(maxLength: 10)->capture(array_fill(0, 300, 'abcdefghij'), 'input');

        // 101 strings are kept, since the budget is passed by the 101st.
        expect(array_slice($captured->value, 0, 101))->each->toBe('abcdefghij')
            ->and(array_slice($captured->value, 101))->each->toBe('')
            ->and($captured->value)->toHaveCount(300)
            ->and($captured->truncated)->toHaveCount(50)
            ->and(array_key_first($captured->truncated))->toBe('input.101')
            ->and($captured->truncated['input.101'])->toBe(10);
    });

    it('counts what is kept, not what was read', function () {
        $captured = Payloads::make(maxLength: 10)->capture(array_fill(0, 300, str_repeat('x', 1000)), 'input');

        // Each string keeps 10 characters, so the budget of 1000 is passed after 101 of them.
        expect(array_slice($captured->value, 100, 2))->toBe([str_repeat('x', 10), '']);
    });

    it('is a budget of each field, not of the process', function () {
        $payload = Payloads::make(maxLength: 10);
        $payload->capture(array_fill(0, 300, 'abcdefghij'));
        $second = $payload->capture(array_fill(0, 50, 'abcdefghij'));

        expect($second->value)->each->toBe('abcdefghij')->and($second->truncated)->toBe([]);
    });

    it('does not apply without a limit', function () {
        $captured = Payloads::make(maxLength: null)->capture(array_fill(0, 5, str_repeat('x', 500_000)));

        expect($captured->value)->each->toHaveLength(500_000)->and($captured->truncated)->toBe([]);
    });

    it('keeps at most fifty truncated paths, with the flag still true', function () {
        $captured = Payloads::make(maxLength: 1)->capture(array_fill(0, 200, 'ab'), 'input');

        expect($captured->truncated)->toHaveCount(50)->and(array_key_last($captured->truncated))->toBe('input.49');
    });
});

describe('what is cut silently', function () {
    it('is flagged when the node budget runs out', function () {
        $captured = Payloads::make()->capture(array_fill(0, 12_000, 'x'));

        expect($captured->dropped)->toBeTrue()->and($captured->truncated)->toBe([]);
    });

    it('is flagged when the depth limit is reached', function () {
        $deep = 'leaf';

        for ($level = 0; $level < 40; $level++) {
            $deep = [$deep];
        }

        expect(Payloads::make()->capture($deep)->dropped)->toBeTrue();
    });

    it('is not flagged for a null that is cut, nor for a value that fits', function () {
        $deep = null;

        for ($level = 0; $level < 32; $level++) {
            $deep = [$deep];
        }

        expect(Payloads::make()->capture($deep)->dropped)->toBeFalse()
            ->and(Payloads::make()->capture(['a' => [1, 2, 3]])->dropped)->toBeFalse();
    });
});

describe('the span flag for what is cut silently', function () {
    it('marks the span truncated without a path', function () {
        $span = new SpanDraft('s', SpanType::Step, 'step', Status::Running, new DateTimeImmutable);
        $span->apply('input', new Captured(['a' => null], dropped: true));

        expect($span->truncated)->toBeTrue()->and($span->metadata)->toBeNull();
    });

    it('keeps at most fifty truncated paths over everything noted on it', function () {
        $span = new SpanDraft('s', SpanType::Step, 'step', Status::Running, new DateTimeImmutable);
        $span->apply('input', new Captured([], false, array_combine(array_map(fn (int $i) => "input.{$i}", range(1, 40)), array_fill(0, 40, 9))));
        $span->apply('output', new Captured([], false, array_combine(array_map(fn (int $i) => "output.{$i}", range(1, 40)), array_fill(0, 40, 9))));

        expect($span->truncated)->toBeTrue()
            ->and($span->metadata['truncated'])->toHaveCount(50)
            ->and(array_key_first($span->metadata['truncated']))->toBe('input.1')
            ->and(array_key_last($span->metadata['truncated']))->toBe('output.10');
    });
});
