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

/**
 * Turns SDK values into arrays and scalars that can be stored as JSON. Every captured value
 * passes through here, so this is the one place to redact or truncate.
 */
final class Payload
{
    private const MAX_DEPTH = 32;

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
     * A JSON-safe copy of any value.
     */
    public static function value(mixed $value, int $depth = 0): mixed
    {
        if ($depth >= self::MAX_DEPTH) {
            return null;
        }

        return match (true) {
            $value === null, is_string($value), is_int($value), is_bool($value) => $value,
            is_float($value) => is_finite($value) ? $value : null,
            is_array($value) => array_map(fn (mixed $item): mixed => self::value($item, $depth + 1), $value),
            $value instanceof BackedEnum => $value->value,
            $value instanceof Stringable => (string) $value,
            $value instanceof JsonSerializable => self::value($value->jsonSerialize(), $depth + 1),
            $value instanceof Arrayable => self::value($value->toArray(), $depth + 1),
            $value instanceof Closure => null,
            is_object($value) => ['class' => explode("\0", $value::class)[0]],
            default => null,
        };
    }
}
