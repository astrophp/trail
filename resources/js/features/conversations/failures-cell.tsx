import type { Conversation } from '@/api/types'
import { formatCount } from '@/lib/format'

/** The turns that failed or were left incomplete. None is a real answer, drawn as a quiet dash. */
export function FailuresCell({ conversation }: { conversation: Conversation }) {
    const failures = conversation.turns.failed + conversation.turns.incomplete

    if (failures === 0) {
        return (
            <span className="text-faint">
                <span aria-hidden="true">—</span>
                <span className="sr-only">No failures</span>
            </span>
        )
    }

    return (
        <span className="text-destructive tabular-nums">
            {formatCount(failures)}
            <span className="sr-only">
                {' '}
                {failures === 1 ? 'failure' : 'failures'}
            </span>
        </span>
    )
}
