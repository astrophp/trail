import { ClockIcon } from 'lucide-react'
import type { Ref } from 'react'
import type { AgentSubtotal, Span, SpanType } from '@/api/types'
import { AttemptLabel } from '@/components/telemetry/attempt-label'
import { CostValue } from '@/components/telemetry/cost-value'
import { DurationValue } from '@/components/telemetry/duration-value'
import { RespondingModel } from '@/components/telemetry/responding-model'
import { SpanTypeIcon } from '@/components/telemetry/span-type-icon'
import { StatusBadge } from '@/components/telemetry/status-badge'
import { TokenValue } from '@/components/telemetry/token-value'
import type { SpanTree } from '@/features/trace/build-span-tree'
import { SpanAncestors } from '@/features/trace/span-ancestors'
import { spanBilling } from '@/features/trace/span-billing'
import { spanTitle } from '@/features/trace/span-title'
import { formatOffset } from '@/lib/format'
import { cn } from '@/lib/utils'

const ownTitle = "This agent's own steps, without delegated agents"

/** What kind of span it is, in words: the line under its name. */
const kinds: Record<SpanType, string> = {
    agent: 'Agent run',
    step: 'Model step',
    tool: 'Tool call',
    embedding: 'Embedding',
}

type SpanHeaderProps = {
    span: Span
    tree: SpanTree
    /** The server's subtotal for this span, when it is an agent. */
    subtotal: AgentSubtotal | undefined
    onSelect: (id: string) => void
    /** The heading, so the page can move focus to it after a span was opened from inside the panel. */
    headingRef?: Ref<HTMLHeadingElement>
    className?: string
}

/**
 * Which span this is and how it went: the spans above it, its name with its status, what kind of
 * span it is and with which model, and one row of its duration, start, tokens and cost. An agent's
 * tokens and cost are its own steps; the run's total, in the page header, includes delegated agents.
 */
export function SpanHeader({
    span,
    tree,
    subtotal,
    onSelect,
    headingRef,
    className,
}: SpanHeaderProps) {
    const billing = spanBilling(span, subtotal)
    const own = span.type === 'agent'

    return (
        <header
            data-slot="span-header"
            className={cn('flex min-w-0 flex-col gap-1.5', className)}
        >
            <SpanAncestors
                tree={tree}
                spanId={span.id}
                onSelect={onSelect}
                className="mb-1"
            />
            <div className="flex min-w-0 items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                    <SpanTypeIcon
                        type={span.type}
                        decorative
                        className="size-4.5"
                    />
                    {/* Focusable by script only: focus lands here when a span is opened from inside the panel. */}
                    <h2
                        ref={headingRef}
                        tabIndex={-1}
                        title={spanTitle(span)}
                        className="truncate rounded-sm text-heading outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        {spanTitle(span)}
                    </h2>
                </div>
                <StatusBadge
                    status={span.status}
                    className="shrink-0 text-xs"
                />
            </div>
            <p className="text-ui text-muted-foreground">
                {kinds[span.type]}
                {span.type === 'tool' || span.model === null ? null : (
                    <>
                        {' · '}
                        <span className="font-mono text-xs">{span.model}</span>
                    </>
                )}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-caption text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                    <ClockIcon aria-hidden="true" className="size-3" />
                    <DurationValue of={span} />
                </span>
                <span>Started {formatOffset(span.offset_ms)}</span>
                {billing ? (
                    <>
                        <span
                            title={own ? ownTitle : undefined}
                            className="inline-flex items-baseline gap-1"
                        >
                            <TokenValue usage={billing.usage} />
                            {own ? 'own tokens' : 'tokens'}
                        </span>
                        <span
                            title={own ? ownTitle : undefined}
                            className="inline-flex items-baseline gap-1"
                        >
                            <CostValue cost={billing.cost} />
                            {own ? 'own cost' : 'cost'}
                        </span>
                    </>
                ) : null}
                <RespondingModel
                    model={span.model}
                    responding={
                        span.type === 'tool' ? undefined : span.responding_model
                    }
                    expected={
                        span.type === 'step' && span.status === 'completed'
                    }
                />
                <AttemptLabel attempt={span.attempt} of={tree.attempts} />
            </div>
        </header>
    )
}
