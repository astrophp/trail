<?php

namespace Astro\Trail\Capture;

use BackedEnum;
use Closure;
use Illuminate\Contracts\Support\Arrayable;
use JsonSerializable;
use Laravel\Ai\Gateway\TextGenerationOptions;
use Laravel\Ai\Messages\AssistantMessage;
use Laravel\Ai\Messages\Message;
use Laravel\Ai\Messages\ToolResultMessage;
use Laravel\Ai\Messages\UserMessage;
use Laravel\Ai\Responses\Data\ToolCall;
use Stringable;
use Throwable;

/**
 * Turns SDK values into arrays and scalars that can be stored as JSON. Every captured value
 * passes through here, so this is the one place to redact or truncate.
 */
final class Payload
{
    private const MAX_DEPTH = 32;

    /** The most values one call to value() will visit before cutting the rest to null. */
    private const MAX_NODES = 10_000;

    /**
     * @param  array<array-key, mixed>  $messages
     * @return list<array<string, mixed>>
     */
    public static function messages(array $messages): array
    {
        $captured = [];

        foreach ($messages as $message) {
            if (! $message instanceof Message) {
                $captured[] = ['role' => null, 'content' => self::value($message)];

                continue;
            }

            $entry = ['role' => $message->role->value, 'content' => self::value($message->content)];

            if ($message instanceof AssistantMessage && $message->toolCalls->isNotEmpty()) {
                $entry['tool_calls'] = self::toolCalls($message->toolCalls->all());
            }

            if ($message instanceof ToolResultMessage && $message->toolResults->isNotEmpty()) {
                $entry['tool_results'] = $message->toolResults->map(fn ($result): array => [
                    'id' => $result->id,
                    'name' => $result->name,
                    'result' => self::value($result->result),
                ])->values()->all();
            }

            if ($message instanceof UserMessage && $message->attachments->isNotEmpty()) {
                $entry['attachments'] = $message->attachments->count();
            }

            $captured[] = $entry;
        }

        return $captured;
    }

    /**
     * Only public properties are read: the options' own providerOptions() method calls user code.
     *
     * @return array<string, mixed>|null
     */
    public static function options(?TextGenerationOptions $options): ?array
    {
        if ($options === null) {
            return null;
        }

        return [
            'max_steps' => $options->maxSteps,
            'max_tokens' => $options->maxTokens,
            'temperature' => $options->temperature,
            'top_p' => $options->topP,
            'tool_choice' => $options->toolChoice === null ? null : [
                'mode' => $options->toolChoice->mode,
                'tool' => $options->toolChoice->toolName,
            ],
            'provider_options' => self::value($options->providerOptions),
        ];
    }

    /**
     * @param  array<array-key, mixed>  $toolCalls
     * @return list<array<string, mixed>>
     */
    public static function toolCalls(array $toolCalls): array
    {
        $captured = [];

        foreach ($toolCalls as $call) {
            if (! $call instanceof ToolCall) {
                continue;
            }

            $captured[] = [
                'id' => $call->id,
                'name' => $call->name,
                'arguments' => self::value($call->arguments),
            ];
        }

        return $captured;
    }

    /**
     * A JSON-safe copy of any value. It never throws: user code that fails is stored as its class
     * name, cycles are cut where they close, and a value that is too deep or too wide is cut to null.
     */
    public static function value(mixed $value): mixed
    {
        return self::capture($value, 0, new PayloadContext(self::MAX_NODES));
    }

    private static function capture(mixed $value, int $depth, PayloadContext $context): mixed
    {
        if ($depth >= self::MAX_DEPTH || $context->budget-- <= 0) {
            return null;
        }

        return match (true) {
            $value === null, is_string($value), is_int($value), is_bool($value) => $value,
            is_float($value) => is_finite($value) ? $value : null,
            is_array($value) => self::items($value, $depth, $context),
            $value instanceof BackedEnum => $value->value,
            $value instanceof Closure => null,
            $value instanceof JsonSerializable => self::expand($value, fn (): mixed => $value->jsonSerialize(), $depth, $context),
            $value instanceof Arrayable => self::expand($value, fn (): mixed => $value->toArray(), $depth, $context),
            $value instanceof Stringable => self::stringify($value),
            is_object($value) => ['class' => self::className($value)],
            default => null,
        };
    }

    /**
     * @param  array<array-key, mixed>  $items
     * @return array<array-key, mixed>
     */
    private static function items(array $items, int $depth, PayloadContext $context): array
    {
        $captured = [];

        foreach ($items as $key => $item) {
            $captured[$key] = self::capture($item, $depth + 1, $context);
        }

        return $captured;
    }

    /**
     * Expand an object through its own method, unless it is already being expanded further up.
     *
     * @param  Closure(): mixed  $expand
     */
    private static function expand(object $object, Closure $expand, int $depth, PayloadContext $context): mixed
    {
        $id = spl_object_id($object);

        if (isset($context->expanding[$id])) {
            return ['class' => self::className($object)];
        }

        $context->expanding[$id] = true;

        try {
            return self::capture($expand(), $depth + 1, $context);
        } catch (Throwable) {
            return ['class' => self::className($object)];
        } finally {
            unset($context->expanding[$id]);
        }
    }

    private static function stringify(Stringable $value): mixed
    {
        try {
            return (string) $value;
        } catch (Throwable) {
            return ['class' => self::className($value)];
        }
    }

    /**
     * The class name, without the file path an anonymous class carries after a NUL byte.
     */
    private static function className(object $object): string
    {
        return explode("\0", $object::class)[0];
    }
}
