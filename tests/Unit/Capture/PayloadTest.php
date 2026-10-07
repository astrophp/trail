<?php

use Astro\Trail\Capture\Payload;
use Astro\Trail\Tests\Fixtures\Capture\PayloadPlain;
use Astro\Trail\Tests\Fixtures\Capture\PayloadSuit;
use Illuminate\Contracts\Support\Arrayable;
use Laravel\Ai\Gateway\TextGenerationOptions;
use Laravel\Ai\Messages\AssistantMessage;
use Laravel\Ai\Messages\Message;
use Laravel\Ai\Messages\ToolResultMessage;
use Laravel\Ai\Messages\UserMessage;
use Laravel\Ai\Responses\Data\ToolCall;
use Laravel\Ai\Responses\Data\ToolResult;
use Laravel\Ai\ToolChoice;

it('keeps scalars and null as they are', function () {
    expect(Payload::value('text'))->toBe('text')
        ->and(Payload::value(3))->toBe(3)
        ->and(Payload::value(1.5))->toBe(1.5)
        ->and(Payload::value(false))->toBeFalse()
        ->and(Payload::value(null))->toBeNull()
        ->and(Payload::value(INF))->toBeNull()
        ->and(Payload::value(NAN))->toBeNull();
});

it('recurses into nested arrays, keeping their keys', function () {
    $value = ['a' => [1, ['b' => new class implements Stringable
    {
        public function __toString(): string
        {
            return 'deep';
        }
    }]], 5 => PayloadSuit::Hearts];

    expect(Payload::value($value))->toBe(['a' => [1, ['b' => 'deep']], 5 => 'hearts']);
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

    expect(Payload::value($json))->toBe(['when' => 'hearts', 'nested' => ['class' => 'ArrayObject']])
        ->and(Payload::value($arrayable))->toBe(['x' => 1])
        ->and(Payload::value(PayloadSuit::Hearts))->toBe('hearts');
});

it('stores only the class of any other object, never its state or an anonymous class path', function () {
    $secret = new class
    {
        public string $token = 'secret';
    };

    expect(Payload::value(new DateTimeImmutable))->toBe(['class' => DateTimeImmutable::class])
        ->and(Payload::value(PayloadPlain::One))->toBe(['class' => PayloadPlain::class])
        ->and(Payload::value($secret))->toBe(['class' => 'class@anonymous'])
        ->and(json_encode(Payload::value($secret)))->not->toContain('secret');
});

it('drops closures and resources', function () {
    $resource = fopen('php://memory', 'r');

    expect(Payload::value(fn () => 1))->toBeNull()
        ->and(Payload::value($resource))->toBeNull()
        ->and(Payload::value(['keep' => 1, 'closure' => fn () => 1, 'resource' => $resource]))->toBe(['keep' => 1, 'closure' => null, 'resource' => null]);

    fclose($resource);
});

it('stops at 32 levels instead of recursing forever', function () {
    $deep = 'leaf';

    for ($level = 0; $level < 40; $level++) {
        $deep = [$deep];
    }

    $captured = Payload::value($deep);
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

    expect(Payload::value($cycle))->toBe([['class' => 'JsonSerializable@anonymous']]);
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
    $captured = Payload::value($fan);

    expect($captured)->toBe([['class' => 'JsonSerializable@anonymous'], ['class' => 'JsonSerializable@anonymous']])
        ->and((hrtime(true) - $started) / 1e9)->toBeLessThan(1.0);
});

it('stops at a node budget on a very wide value', function () {
    $captured = Payload::value(array_fill(0, 25_000, 'x'));

    $kept = count(array_filter($captured, fn ($item) => $item === 'x'));

    expect($captured)->toHaveCount(25_000)
        ->and($kept)->toBeGreaterThan(9_000)->toBeLessThanOrEqual(10_000)
        ->and($captured[24_999])->toBeNull();
});

it('does not share a budget between calls', function () {
    Payload::value(array_fill(0, 25_000, 'x'));

    expect(Payload::value(['a', 'b']))->toBe(['a', 'b']);
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

    expect(Payload::value([$json, $arrayable, $stringable]))->toBe([['class' => 'JsonSerializable@anonymous'], ['class' => 'Illuminate\\Contracts\\Support\\Arrayable@anonymous'], ['class' => 'Stringable@anonymous']]);
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

    expect(Payload::value($model))->toBe(['id' => 1])
        ->and(Payload::value(collect(['a' => 1])))->toBe(['a' => 1]);
});

it('captures messages with their tool calls and results, and attachments as a count', function () {
    $messages = [
        new UserMessage('Hi', [new stdClass, new stdClass]),
        new AssistantMessage('', collect([new ToolCall('call_1', 'lookup', ['query' => 'x'], reasoningEncryptedContent: 'opaque')])),
        new ToolResultMessage(collect([new ToolResult('call_1', 'lookup', ['query' => 'x'], 'found')])),
        new Message('assistant', 'Done'),
    ];

    expect(Payload::messages($messages))->toBe([
        ['role' => 'user', 'content' => 'Hi', 'attachments' => 2],
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

    expect(Payload::options($options))->toBe([
        'max_steps' => 5,
        'max_tokens' => 100,
        'temperature' => 0.2,
        'top_p' => 0.9,
        'tool_choice' => ['mode' => 'tool', 'tool' => 'lookup'],
        'provider_options' => ['thinking' => ['budget' => 10]],
    ])->and(Payload::options(null))->toBeNull()
        ->and(Payload::options(new TextGenerationOptions)['tool_choice'])->toBeNull();
});
