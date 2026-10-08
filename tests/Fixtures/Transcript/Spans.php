<?php

namespace Astro\Trail\Tests\Fixtures\Transcript;

use Astro\Trail\Transcript\StitchSpan;
use Astro\Trail\Transcript\Transcript;
use Astro\Trail\Transcript\TurnStitcher;

/**
 * Builders for the spans of a turn, as the stitching reads them, with the ids and sequences laid
 * out by hand so a test states exactly which span is which.
 */
final class Spans
{
    /**
     * The agent span of a turn. Everything else in a turn is its child.
     *
     * @param  array<string, mixed>  $input
     */
    public static function root(array $input = ['prompt' => 'Hi'], int $attempt = 1, string $id = 'r'): StitchSpan
    {
        return self::make($id, null, 'agent', 1, ['attempt' => $attempt, 'name' => 'Assistant', 'input' => $input]);
    }

    /**
     * A step of the turn. `messages` null is a step recorded without its start event.
     *
     * @param  list<mixed>|null  $messages
     * @param  array<string, mixed>|null  $output
     * @param  array<string, mixed>  $attributes
     */
    public static function step(string $id, int $sequence, ?array $messages, int $offset = 0, ?array $output = null, array $attributes = []): StitchSpan
    {
        return self::make($id, $attributes['parent'] ?? 'r', 'step', $sequence, [
            'input' => $messages === null ? ['messages' => null, 'options' => null] : ['messages' => $messages, 'messages_offset' => $offset, 'options' => null],
            'output' => $output,
            ...$attributes,
        ]);
    }

    /**
     * A tool span of the turn.
     *
     * @param  array<string, mixed>|null  $input
     * @param  array<string, mixed>  $attributes
     */
    public static function tool(string $id, int $sequence, string $name, ?array $input, array $attributes = []): StitchSpan
    {
        return self::make($id, $attributes['parent'] ?? 'r', 'tool', $sequence, ['name' => $name, 'input' => $input, ...$attributes]);
    }

    /**
     * A span of any type from the attributes the test cares about.
     *
     * @param  array<string, mixed>  $attributes
     */
    public static function make(string $id, ?string $parent, string $type, int $sequence, array $attributes = []): StitchSpan
    {
        return new StitchSpan(
            id: $id,
            parentId: $parent,
            type: $type,
            name: $attributes['name'] ?? ($type === 'step' ? 'step' : 'span'),
            agentClass: $attributes['agent_class'] ?? null,
            attempt: $attributes['attempt'] ?? 1,
            sequence: $sequence,
            status: $attributes['status'] ?? 'completed',
            issueKind: $attributes['issue_kind'] ?? null,
            durationMs: array_key_exists('duration_ms', $attributes) ? $attributes['duration_ms'] : 1.5,
            provider: $attributes['provider'] ?? 'anthropic',
            model: $attributes['model'] ?? 'claude-test',
            error: $attributes['error'] ?? null,
            input: $attributes['input'] ?? null,
            output: $attributes['output'] ?? null,
            redacted: $attributes['redacted'] ?? false,
            truncated: $attributes['truncated'] ?? false,
            truncatedPaths: $attributes['truncated_paths'] ?? [],
            pendingApprovals: $attributes['pending_approvals'] ?? [],
            resolvedToolCallIds: $attributes['resolved_tool_call_ids'] ?? [],
        );
    }

    /**
     * @param  list<StitchSpan>  $spans
     * @param  list<string>  $pending
     * @param  list<string>  $resolved
     */
    public static function stitch(array $spans, string $status = 'completed', array $pending = [], array $resolved = [], bool $limited = false): Transcript
    {
        return TurnStitcher::stitch($spans, $status, $pending, $resolved, $limited);
    }

    /**
     * What each message of a transcript is, at a glance: its part, role and content.
     *
     * @return list<array{string, ?string, mixed}>
     */
    public static function outline(Transcript $transcript): array
    {
        return array_map(fn (array $message): array => [$message['part'], $message['role'], $message['content']], $transcript->messages);
    }

    /**
     * Where each message is stored: the span and the path in it.
     *
     * @return list<string>
     */
    public static function sources(Transcript $transcript): array
    {
        return array_map(fn (array $message): string => $message['source']['span_id'].':'.$message['source']['path'], $transcript->messages);
    }

    public static function user(string $content): array
    {
        return ['role' => 'user', 'content' => $content];
    }

    /**
     * @param  list<array<string, mixed>>  $calls
     */
    public static function assistant(string $content, array $calls = []): array
    {
        return ['role' => 'assistant', 'content' => $content, ...($calls === [] ? [] : ['tool_calls' => $calls])];
    }

    /**
     * @param  list<array<string, mixed>>  $results
     */
    public static function toolResult(array $results): array
    {
        return ['role' => 'tool_result', 'content' => null, 'tool_results' => $results];
    }

    /**
     * @param  array<string, mixed>  $arguments
     */
    public static function call(string $id, string $name, array $arguments = []): array
    {
        return ['id' => $id, 'name' => $name, 'arguments' => $arguments];
    }

    /**
     * The output of a step that ended with text.
     */
    public static function text(string $text): array
    {
        return ['text' => $text, 'tool_calls' => [], 'finish_reason' => 'stop'];
    }

    /**
     * The output of a step that asked for tools.
     *
     * @param  list<array<string, mixed>>  $calls
     */
    public static function asking(array $calls, string $text = ''): array
    {
        return ['text' => $text, 'tool_calls' => $calls, 'finish_reason' => 'tool_calls'];
    }
}
