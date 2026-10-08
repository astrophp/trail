import type { AgentSubtotal, Span } from '@/api/types'
import { AttemptLabel } from '@/components/telemetry/attempt-label'
import { CostValue } from '@/components/telemetry/cost-value'
import { DurationValue } from '@/components/telemetry/duration-value'
import { ErrorSummary } from '@/components/telemetry/error-summary'
import { ModelLabel } from '@/components/telemetry/model-label'
import {
    SpanTypeIcon,
    spanTypeLabel,
} from '@/components/telemetry/span-type-icon'
import { StatusBadge } from '@/components/telemetry/status-badge'
import { TokenValue } from '@/components/telemetry/token-value'
import { Fact } from '@/features/trace/fact'
import { spanBilling } from '@/features/trace/span-billing'
import { spanTitle } from '@/features/trace/span-title'
import { cn } from '@/lib/utils'

const ownTitle = "This agent's own steps, without delegated agents"

type SpanFactsProps = {
    span: Span
    /** How many attempts the run made. */
    attempts: number
    /** The server's subtotal for this span, when it is an agent. */
    subtotal: AgentSubtotal | undefined
    className?: string
}

/** What is known about the selected span, in one small pane. */
export function SpanFacts({
    span,
    attempts,
    subtotal,
    className,
}: SpanFactsProps) {
    const billing = spanBilling(span, subtotal)
    // An agent's amounts are its own steps; the run's total, in the header, includes delegated agents.
    const own = span.type === 'agent'

    return (
        <section
            data-slot="span-facts"
            aria-label="Selected span"
            className={cn(
                'flex flex-col gap-4 rounded-xl border bg-card p-4',
                className,
            )}
        >
            <div className="flex min-w-0 items-center gap-2">
                <SpanTypeIcon type={span.type} decorative />
                <div className="flex min-w-0 flex-col">
                    <h2 className="truncate text-heading">{spanTitle(span)}</h2>
                    <p className="text-caption text-muted-foreground">
                        {spanTypeLabel(span.type)}
                    </p>
                </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Fact label="Status">
                    <StatusBadge status={span.status} />
                </Fact>
                {attempts > 1 ? (
                    <Fact label="Attempt">
                        <AttemptLabel
                            attempt={span.attempt}
                            of={attempts}
                            className="text-ui text-foreground"
                        />
                    </Fact>
                ) : null}
                <Fact label="Duration">
                    <DurationValue of={span} />
                </Fact>
                {span.type === 'tool' ? null : (
                    <Fact label="Requested model">
                        <ModelLabel of={span} />
                    </Fact>
                )}
                {billing ? (
                    <>
                        <Fact
                            label={own ? 'Own tokens' : 'Tokens'}
                            title={own ? ownTitle : undefined}
                        >
                            <TokenValue usage={billing.usage} />
                        </Fact>
                        <Fact
                            label={own ? 'Own cost' : 'Cost'}
                            title={own ? ownTitle : undefined}
                        >
                            <CostValue cost={billing.cost} />
                        </Fact>
                    </>
                ) : null}
            </dl>
            {span.status === 'failed' ? (
                <ErrorSummary error={span.error} issueKind={span.issue_kind} />
            ) : null}
        </section>
    )
}
