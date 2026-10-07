<?php

use Astro\Trail\Capture\Payload;
use Illuminate\Contracts\Support\Arrayable;
use Laravel\Ai\Gateway\TextGenerationOptions;
use Laravel\Ai\Messages\AssistantMessage;
use Laravel\Ai\Messages\Message;
use Laravel\Ai\Messages\ToolResultMessage;
use Laravel\Ai\Messages\UserMessage;
use Laravel\Ai\Responses\Data\ToolCall;
use Laravel\Ai\Responses\Data\ToolResult;
use Laravel\Ai\ToolChoice;

enum PayloadSuit: string
{
    case Hearts = 'hearts';
}

enum PayloadPlain
{
    case One;
}

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

    $self = new ArrayObject;
    $self['me'] = $self;

    $captured = Payload::value($deep);
    $levels = 0;

    while (is_array($captured)) {
        $captured = $captured[0];
        $levels++;
    }

    expect($captured)->toBeNull()
        ->and($levels)->toBe(32)
        ->and(json_encode(Payload::value($self)))->toBeString();
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
