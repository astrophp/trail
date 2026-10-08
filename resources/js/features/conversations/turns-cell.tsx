import type { Conversation } from '@/api/types'
import { StatusBadge } from '@/components/telemetry/status-badge'
import { formatCount } from '@/lib/format'

/**
 * How many turns a conversation has, and a marker for each kind of turn that is not over yet:
 * still running, or waiting for a person to approve. The marker names the state in words; the
 * colour only reinforces it.
 */
export function TurnsCell({ conversation }: { conversation: Conversation }) {
    const { all, running, awaiting_approval: awaiting } = conversation.turns

    return (
        <span className="inline-flex items-center justify-end gap-2">
            {running === 0 ? null : (
                <span title={`${formatCount(running)} running`}>
                    <StatusBadge status="running" tinted />
                </span>
            )}
            {awaiting === 0 ? null : (
                <span title={`${formatCount(awaiting)} awaiting approval`}>
                    <StatusBadge status="awaiting_approval" tinted />
                </span>
            )}
            <span className="tabular-nums">
                {formatCount(all)}
                <span className="sr-only"> {all === 1 ? 'turn' : 'turns'}</span>
            </span>
        </span>
    )
}
