<?php

namespace Astro\Trail\Http\Resources;

use Astro\Trail\Storage\Models\Trace;

/**
 * What a run's page shows beside the run: the full error, and the approvals its metadata holds.
 * The run keeps one shape everywhere, so none of this travels with it in a list.
 */
final class TraceDetailResource
{
    /**
     * @return array{error: array<string, mixed>|null, pending_approvals: list<array<string, mixed>>, resolved_tool_call_ids: list<string>}
     */
    public static function of(Trace $trace): array
    {
        $metadata = is_array($trace->metadata) ? $trace->metadata : [];

        return [
            'error' => ErrorResource::of($trace),
            'pending_approvals' => self::pendingApprovals($metadata['pending_approvals'] ?? null),
            'resolved_tool_call_ids' => self::strings($metadata['resolved_tool_call_ids'] ?? null),
        ];
    }

    /**
     * The metadata is JSON of a shape nobody checked, so an entry that is not a call with a tool
     * is left out rather than guessed at.
     *
     * @return list<array{tool_call_id: string, tool: string, arguments: mixed, reason: ?string}>
     */
    private static function pendingApprovals(mixed $stored): array
    {
        $approvals = [];

        foreach (is_array($stored) ? $stored : [] as $entry) {
            if (! is_array($entry) || ! is_string($entry['tool_call_id'] ?? null) || ! is_string($entry['tool'] ?? null)) {
                continue;
            }

            $approvals[] = [
                'tool_call_id' => $entry['tool_call_id'],
                'tool' => $entry['tool'],
                'arguments' => $entry['arguments'] ?? null,
                'reason' => is_string($entry['reason'] ?? null) ? $entry['reason'] : null,
            ];
        }

        return $approvals;
    }

    /**
     * @return list<string>
     */
    private static function strings(mixed $stored): array
    {
        return is_array($stored) ? array_values(array_filter($stored, is_string(...))) : [];
    }
}
