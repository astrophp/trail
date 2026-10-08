import { IssueLabel } from '@/components/telemetry/issue-label'
import { CostValue } from '@/components/telemetry/cost-value'
import { DurationValue } from '@/components/telemetry/duration-value'
import { ModelLabel } from '@/components/telemetry/model-label'
import { StatusBadge } from '@/components/telemetry/status-badge'
import { Timestamp } from '@/components/telemetry/timestamp'
import { TokenCount } from '@/components/telemetry/token-count'
import { TokenValue } from '@/components/telemetry/token-value'
import { TraceFlags } from '@/components/telemetry/trace-flags'
import type { Side } from '@/features/compare/compare-side'
import { formatCount } from '@/lib/format'
import type { ReactNode } from 'react'

export type CompareRowDef = {
    label: string
    cell: (side: Side) => ReactNode
    /**
     * What the two sides are compared by: the same text they show, or `null` when a side has
     * nothing to compare. A row is marked as differing only when both keys are present and not
     * equal. A row without one is never marked: nothing is computed from the values.
     */
    key?: (side: Side) => string | number | boolean | null
    /** Counted from the spans that came back: for a run with more spans than that, a lower bound. */
    partial?: boolean
    /** Follows the spans, which still change while a run is running: not marked then. */
    structure?: boolean
}

const count =
    (of: (side: Side) => number | null) =>
    (side: Side): ReactNode => {
        const value = of(side)

        return value === null ? (
            <span className="text-muted-foreground">Not captured</span>
        ) : (
            <span className="tabular-nums">
                {side.truncated ? 'At least ' : null}
                {formatCount(value)}
            </span>
        )
    }

/** Counts of a kind of span: rows that compare by their number. */
const countRow = (
    label: string,
    of: (side: Side) => number | null,
): CompareRowDef => ({
    label,
    cell: count(of),
    key: of,
    partial: true,
    structure: true,
})

/** The attributes of a run, in the order they are shown, below its name and link. */
export const compareRows: CompareRowDef[] = [
    {
        label: 'Status',
        cell: ({ trace }) => (
            <div className="flex flex-col items-start gap-0.75">
                <StatusBadge status={trace.status} />
                <TraceFlags trace={trace} />
                {trace.issue_kind === null ? null : (
                    <IssueLabel
                        kind={trace.issue_kind}
                        className="text-caption text-muted-foreground"
                    />
                )}
            </div>
        ),
        key: ({ trace }) =>
            `${trace.status} ${trace.issue_kind} ${trace.recovered} ${trace.child_failed}`,
    },
    {
        label: 'Started',
        cell: ({ trace }) => <Timestamp at={trace.started_at} layout="full" />,
    },
    {
        label: 'Duration',
        cell: ({ trace }) => <DurationValue of={trace} />,
    },
    {
        label: 'Tokens',
        cell: ({ trace: { usage } }) => (
            <div className="flex flex-col gap-0.75">
                <TokenValue usage={usage} />
                <span className="text-caption text-muted-foreground">
                    In{' '}
                    <TokenCount
                        count={usage.input_tokens}
                        pending={usage.state === 'pending'}
                    />
                    {' · '}Out{' '}
                    <TokenCount
                        count={usage.output_tokens}
                        pending={usage.state === 'pending'}
                    />
                </span>
            </div>
        ),
    },
    {
        label: 'Est. cost',
        cell: ({ trace }) => <CostValue cost={trace.cost} />,
    },
    {
        label: 'Agent',
        cell: ({ trace }) => (
            <div className="flex flex-col">
                <span>{trace.name}</span>
                <span className="font-mono text-caption text-muted-foreground">
                    {trace.agent_class ?? 'Not captured'}
                </span>
            </div>
        ),
        key: ({ trace }) => `${trace.name} ${trace.agent_class}`,
    },
    {
        label: 'Provider and model',
        cell: ({ trace }) => <ModelLabel of={trace} />,
        key: ({ trace }) =>
            trace.provider === null || trace.model === null
                ? null
                : `${trace.provider} ${trace.model}`,
    },
    {
        label: 'Streamed',
        cell: ({ trace }) => (trace.streamed ? 'Yes' : 'No'),
        key: ({ trace }) => trace.streamed,
    },
    {
        label: 'Spans',
        cell: ({ total, shown, truncated }) => (
            <div className="flex flex-col">
                <span className="tabular-nums">{formatCount(total)}</span>
                {truncated ? (
                    <span className="text-caption text-muted-foreground">
                        The counts by type cover the first {formatCount(shown)}{' '}
                        spans
                    </span>
                ) : null}
            </div>
        ),
        key: ({ total }) => total,
        structure: true,
    },
    countRow('Agents', ({ counts }) => counts.agents),
    countRow('Model steps', ({ counts }) => counts.steps),
    countRow('Tools', ({ counts }) => counts.tools),
    countRow('Embeddings', ({ counts }) => counts.embeddings),
    countRow('Attempts', ({ counts }) => counts.attempts),
    countRow('Failed spans', ({ counts }) => counts.failed),
    countRow('Incomplete spans', ({ counts }) => counts.incomplete),
]
