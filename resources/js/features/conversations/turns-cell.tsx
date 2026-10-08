import type { Conversation } from '@/api/types'
import { StatusBadge } from '@/components/telemetry/status-badge'
import { formatCount } from '@/lib/format'

/**
 * How many turns a conversation has, and a marker for each kind of turn that is not over yet:
 * still running, or waiting for a person to approve. Each marker is an icon in the state's colour with its count in words for
 * assistive technology and as a tooltip.
 */
export function TurnsCell({ conversation }: { conversation: Conversation }) {
    const { all, running, awaiting_approval: awaiting } = conversation.turns

    return (
        <span className="inline-flex items-center justify-end gap-2">
            {running === 0 ? null : (
                <StatusBadge
                    status="running"
                    iconOnly
                    label={`${formatCount(running)} running`}
                />
            )}
            {awaiting === 0 ? null : (
                <StatusBadge
                    status="awaiting_approval"
                    iconOnly
                    label={`${formatCount(awaiting)} awaiting approval`}
                />
            )}
            <span className="tabular-nums">
                {formatCount(all)}
                <span className="sr-only"> {all === 1 ? 'turn' : 'turns'}</span>
            </span>
        </span>
    )
}
