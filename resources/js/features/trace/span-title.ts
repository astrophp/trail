import type { Span } from '@/api/types'

/**
 * The words that name a span in the tree. A step is numbered from 1 for the person, though it is
 * stored from 0, and the number restarts on every failover attempt: it is never renumbered across
 * attempts.
 */
export function spanTitle(
    span: Pick<Span, 'type' | 'name' | 'step_number'>,
): string {
    if (span.type === 'step') {
        return span.step_number === null
            ? 'Model step'
            : `Model step ${span.step_number + 1}`
    }

    return span.name
}

export type SpanSubtitle = {
    text: string
    /** The text is a model's name, set in monospace. */
    mono: boolean
}

/** The second line of a span: its model, what kind of call it is, or whether the agent was delegated to. */
export function spanSubtitle(
    span: Pick<Span, 'type' | 'model'>,
    /** Whether the span hangs under another one in the tree. */
    nested: boolean,
): SpanSubtitle {
    switch (span.type) {
        case 'step':
        case 'embedding':
            return span.model === null
                ? { text: 'Not captured', mono: false }
                : { text: span.model, mono: true }
        case 'tool':
            return { text: 'Tool call', mono: false }
        case 'agent':
            return {
                text: nested ? 'Delegated agent' : 'Agent run',
                mono: false,
            }
    }
}
