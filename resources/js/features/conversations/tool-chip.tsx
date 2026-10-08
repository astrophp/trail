import { Link } from 'react-router'
import type { ToolCall } from '@/api/types'
import { DurationValue } from '@/components/telemetry/duration-value'
import { SpanTypeIcon } from '@/components/telemetry/span-type-icon'
import { StatusBadge } from '@/components/telemetry/status-badge'
import { tracePagePath } from '@/lib/trace-page-path'
import { cn } from '@/lib/utils'

const chip =
    'inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-caption'

type ToolChipProps = {
    call: ToolCall
    /** The run the call belongs to, whose page the chip of a known span opens. */
    traceId: string
    /** The page the chip is on, which the run's page leads back to; see `tracePagePath`. */
    from: string
    /** The chip's link is followed. */
    onVisit?: () => void
    className?: string
}

/**
 * One tool call of a turn as a small chip. A call whose tool span is known links to that span on
 * the run's page and says how it ended and how long it took; a delegation shows the agent it
 * started, its status and links to the agent's span. A call waiting for approval, or not started,
 * says so and is not a link. A call with no confirmed span says nothing about a status.
 */
export function ToolChip({
    call,
    traceId,
    from,
    onVisit,
    className,
}: ToolChipProps) {
    const agent = call.agent
    const name = agent?.name ?? call.name ?? 'Unnamed'
    const icon = <SpanTypeIcon type={agent ? 'agent' : 'tool'} decorative />
    const label = (
        <span className="min-w-0 truncate" title={name}>
            {name}
        </span>
    )

    if (call.link === 'linked' && call.span !== null) {
        const outcome = agent ?? call.span
        const spanId = agent?.span_id ?? call.span.id

        return (
            <Link
                data-slot="tool-chip"
                data-link="linked"
                onClick={onVisit}
                to={tracePagePath(traceId, { span: spanId, from })}
                className={cn(
                    chip,
                    'text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    className,
                )}
            >
                {icon}
                {label}
                <StatusBadge status={outcome.status} iconOnly />
                <DurationValue
                    of={{
                        duration_ms: outcome.duration_ms,
                        status: outcome.status,
                    }}
                    className="text-muted-foreground"
                />
            </Link>
        )
    }

    const state =
        call.link === 'awaiting_approval'
            ? 'Awaiting approval'
            : call.link === 'not_started'
              ? 'Not started'
              : null

    return (
        <span
            data-slot="tool-chip"
            data-link={call.link}
            className={cn(chip, 'text-muted-foreground', className)}
        >
            {icon}
            {label}
            {state === null ? null : (
                <span className="font-sans whitespace-nowrap">{state}</span>
            )}
        </span>
    )
}
