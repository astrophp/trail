<?php

namespace Astro\Trail\Tests\Fixtures\Capture;

/**
 * The step input Trail stores for the common shapes of a run.
 */
final class Steps
{
    /**
     * The input of a first step that sent only the prompt.
     *
     * @return array<string, mixed>
     */
    public static function promptOnly(string $prompt = 'Hi'): array
    {
        return ['messages' => [['role' => 'user', 'content' => $prompt]], 'messages_offset' => 0, 'options' => Captured::NO_OPTIONS];
    }

    /**
     * The input of the step that follows one call of the lookup tool. A step stores only the
     * messages the previous step did not send: here the model's tool call and its result, after
     * the one message (the prompt) that the first step sent.
     *
     * @return array<string, mixed>
     */
    public static function afterLookup(string $callId, string $query): array
    {
        return [
            'messages' => [
                ['role' => 'assistant', 'content' => '', 'tool_calls' => [['id' => $callId, 'name' => 'lookup', 'arguments' => ['query' => $query]]]],
                ['role' => 'tool_result', 'content' => null, 'tool_results' => [['id' => $callId, 'name' => 'lookup', 'result' => 'Result for '.$query]]],
            ],
            'messages_offset' => 1,
            'options' => Captured::NO_OPTIONS,
        ];
    }
}
