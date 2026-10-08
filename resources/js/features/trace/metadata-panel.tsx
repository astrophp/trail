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
import { PayloadSection } from '@/components/telemetry/payload-section'
import { spanBilling } from '@/features/trace/span-billing'
import { formatCount, formatOffset } from '@/lib/format'

type MetadataPanelProps = {
    span: Span
    /** The server's subtotal for this span, when it is an agent. */
    subtotal: AgentSubtotal | undefined
    coverage: Coverage
}

/**
 * Everything recorded about the span apart from its payloads, in one table: ids, order, model,
 * times, tokens and cost. A row that cannot apply to this kind of span is left out; a value that
 * should exist and does not says `Not captured`.
 */
export function MetadataPanel({
    span,
    subtotal,
    coverage,
}: MetadataPanelProps) {
    const billing = spanBilling(span, subtotal)
    const own = span.type === 'agent'
    // Agents, steps and embeddings name a provider and a model; a tool calls none.
    const callsModel = span.type !== 'tool'
    // A step is the only span the provider names a responding model for. A running step has not
    // answered yet; a completed one may not say who did.
    const respondingMissing =
        span.status === 'running'
            ? 'Pending'
            : coverage.responding_model.reason === 'streamed'
              ? 'Not captured (streamed runs do not report it)'
              : undefined

    return (
        <div className="flex flex-col gap-6">
            <KeyValueList layout="rows">
                <KeyValue label="Span id" copy={span.id}>
                    <span className="font-mono text-xs">{span.id}</span>
                </KeyValue>
                {span.parent_id === null ? null : (
                    <KeyValue label="Parent span id" copy={span.parent_id}>
                        <span className="font-mono text-xs">
                            {span.parent_id}
                        </span>
                    </KeyValue>
                )}
                <KeyValue label="Type">{spanTypeLabel(span.type)}</KeyValue>
                <KeyValue label="Attempt">{formatCount(span.attempt)}</KeyValue>
                {span.type === 'step' && span.step_number !== null ? (
                    <KeyValue label="Step index">
                        {formatCount(span.step_number)}
                    </KeyValue>
                ) : null}
                <KeyValue label="Sequence">
                    {formatCount(span.sequence)}
                </KeyValue>
                {callsModel ? (
                    <>
                        <KeyValue label="Provider">{span.provider}</KeyValue>
                        <KeyValue label="Requested model">
                            {span.model === null ? null : (
                                <span className="font-mono">{span.model}</span>
                            )}
                        </KeyValue>
                    </>
                ) : null}
                {span.type === 'step' ? (
                    <KeyValue
                        label="Responding model"
                        missing={respondingMissing}
                    >
                        {span.responding_model === null ? null : (
                            <span className="font-mono">
                                {span.responding_model}
                            </span>
                        )}
                    </KeyValue>
                ) : null}
                <KeyValue label="Status">
                    <StatusBadge status={span.status} />
                </KeyValue>
                {span.issue_kind === null ? null : (
                    <KeyValue label="Issue kind">
                        <IssueLabel kind={span.issue_kind} />
                    </KeyValue>
                )}
                <KeyValue label="Started">
                    <Timestamp at={span.started_at} layout="full" />
                </KeyValue>
                {span.ended_at === null ? null : (
                    <KeyValue label="Ended">
                        <Timestamp at={span.ended_at} layout="full" />
                    </KeyValue>
                )}
                <KeyValue label="Offset">
                    {formatOffset(span.offset_ms)}
                </KeyValue>
                <KeyValue label="Duration">
                    <DurationValue of={span} />
                </KeyValue>
                {billing ? (
                    <>
                        <TokenBreakdown
                            usage={billing.usage}
                            layout="rows"
                            own={own}
                        />
                        <KeyValue label={own ? 'Own cost' : 'Cost'}>
                            <CostValue cost={billing.cost} />
                        </KeyValue>
                    </>
                ) : null}
            </KeyValueList>
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
