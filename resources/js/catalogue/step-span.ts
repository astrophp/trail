import type { Span } from '@/api/types'
import type { JsonValue } from '@/lib/json'

/** A model step span with the given stored input, for specimens that show stored messages. */
export function stepSpan(
    input: JsonValue,
    truncatedPaths: Record<string, number> = {},
): Span {
    return {
        id: 'specimen-step',
        parent_id: null,
        type: 'step',
        name: 'step',
        agent_class: null,
        status: 'completed',
        issue_kind: null,
        attempt: 1,
        sequence: 1,
        step_number: 1,
        provider: null,
        model: null,
        responding_model: null,
        duration_ms: null,
        offset_ms: 0,
        started_at: '2026-01-01T00:00:00Z',
        ended_at: null,
        usage: null,
        cost: null,
        error: null,
        input,
        output: null,
        metadata: null,
        redacted: false,
        truncated: Object.keys(truncatedPaths).length > 0,
        truncated_paths: truncatedPaths,
    }
}
