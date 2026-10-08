import type { AgentSubtotal, Coverage, Span } from '@/api/types'
import { KeyValue } from '@/components/patterns/key-value'
import { KeyValueList } from '@/components/patterns/key-value-list'
import { CostValue } from '@/components/telemetry/cost-value'
import { DurationValue } from '@/components/telemetry/duration-value'
import { IssueLabel } from '@/components/telemetry/issue-label'
import { StatusBadge } from '@/components/telemetry/status-badge'
import { spanTypeLabel } from '@/components/telemetry/span-type-icon'
import { Timestamp } from '@/components/telemetry/timestamp'
import { TokenBreakdown } from '@/components/telemetry/token-breakdown'
import { PayloadSection } from '@/features/trace/payload-section'
import { SectionLabel } from '@/features/trace/section-label'
import { spanBilling } from '@/features/trace/span-billing'
import { formatCount, formatOffset } from '@/lib/format'

type MetadataPanelProps = {
    span: Span
    /** The server's subtotal for this span, when it is an agent. */
    subtotal: AgentSubtotal | undefined
    coverage: Coverage
}

/** Everything recorded about the span apart from its payloads: ids, order, model, times, tokens and cost. */
export function MetadataPanel({
    span,
    subtotal,
    coverage,
}: MetadataPanelProps) {
    const billing = spanBilling(span, subtotal)
    const own = span.type === 'agent'
    const notApplicable = 'Not applicable'
    // A tool calls no model; a step is the only span the provider names a responding model for.
    // A running step has not answered yet; a completed one may not say who did.
    const respondingMissing =
        span.type !== 'step'
            ? notApplicable
            : span.status === 'running'
              ? 'Pending'
              : coverage.responding_model.reason === 'streamed'
                ? 'Not captured (streamed runs do not report it)'
                : undefined
    const modelMissing = span.type === 'tool' ? notApplicable : undefined

    return (
        <div className="flex flex-col gap-6">
            <KeyValueList columns="two">
                <KeyValue label="Span id" copy={span.id}>
                    <span className="font-mono text-xs">{span.id}</span>
                </KeyValue>
                <KeyValue
                    label="Parent span id"
                    copy={span.parent_id ?? undefined}
                    missing="None"
                >
                    {span.parent_id === null ? null : (
                        <span className="font-mono text-xs">
                            {span.parent_id}
                        </span>
                    )}
                </KeyValue>
                <KeyValue label="Type">{spanTypeLabel(span.type)}</KeyValue>
                <KeyValue label="Attempt">{formatCount(span.attempt)}</KeyValue>
                <KeyValue label="Step index" missing={notApplicable}>
                    {span.step_number === null
                        ? null
                        : formatCount(span.step_number)}
                </KeyValue>
                <KeyValue label="Sequence">
                    {formatCount(span.sequence)}
                </KeyValue>
                <KeyValue label="Provider" missing={modelMissing}>
                    {span.provider}
                </KeyValue>
                <KeyValue label="Requested model" missing={modelMissing}>
                    {span.model === null ? null : (
                        <span className="font-mono text-xs">{span.model}</span>
                    )}
                </KeyValue>
                <KeyValue label="Responding model" missing={respondingMissing}>
                    {span.responding_model === null ? null : (
                        <span className="font-mono text-xs">
                            {span.responding_model}
                        </span>
                    )}
                </KeyValue>
                <KeyValue label="Status">
                    <StatusBadge status={span.status} />
                </KeyValue>
                <KeyValue label="Issue kind" missing="None">
                    {span.issue_kind === null ? null : (
                        <IssueLabel kind={span.issue_kind} />
                    )}
                </KeyValue>
                <KeyValue label="Started">
                    <Timestamp at={span.started_at} />
                </KeyValue>
                <KeyValue
                    label="Ended"
                    missing={
                        span.status === 'running' ? 'In progress' : undefined
                    }
                >
                    {span.ended_at === null ? null : (
                        <Timestamp at={span.ended_at} />
                    )}
                </KeyValue>
                <KeyValue label="Offset">
                    {formatOffset(span.offset_ms)}
                </KeyValue>
                <KeyValue label="Duration">
                    <DurationValue of={span} />
                </KeyValue>
                {billing ? (
                    <KeyValue label={own ? 'Own cost' : 'Cost'}>
                        <CostValue cost={billing.cost} />
                    </KeyValue>
                ) : null}
            </KeyValueList>
            {billing ? (
                <section className="flex flex-col gap-3">
                    <SectionLabel>
                        {own ? 'Own token breakdown' : 'Token breakdown'}
                    </SectionLabel>
                    <TokenBreakdown
                        usage={billing.usage}
                        className="max-w-sm"
                    />
                </section>
            ) : null}
            {span.metadata === null ? null : (
                <PayloadSection
                    span={span}
                    path="metadata"
                    heading="Stored metadata"
                    value={span.metadata}
                />
            )}
        </div>
    )
}
