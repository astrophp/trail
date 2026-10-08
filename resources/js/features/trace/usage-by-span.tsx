import type { SpanLimit, TraceUsageBreakdown } from '@/api/types'
import { Notice } from '@/components/patterns/notice'
import { RunPanel } from '@/features/trace/run-panel'
import { UsageTable } from '@/features/trace/usage-table'
import { formatCount } from '@/lib/format'

type UsageBySpanProps = {
    usage: TraceUsageBreakdown
    spanLimit: SpanLimit
    attempts: number
    onOpenSpan: (id: string) => void
    className?: string
}

/** What each step and embedding used and cost, with the way to its span. */
export function UsageBySpan({
    usage,
    spanLimit,
    attempts,
    onOpenSpan,
    className,
}: UsageBySpanProps) {
    return (
        <RunPanel title="Usage by span" className={className}>
            {spanLimit.truncated ? (
                <Notice
                    tone="warning"
                    title={`This table covers the first ${formatCount(spanLimit.limit)} spans. The totals cover the whole run.`}
                />
            ) : null}
            {usage.rows.length === 0 ? (
                <p className="text-ui text-muted-foreground">
                    No model steps or embeddings were recorded for this run.
                </p>
            ) : (
                <UsageTable
                    rows={usage.rows}
                    agents={usage.agents}
                    attempts={attempts}
                    truncated={spanLimit.truncated}
                    onOpenSpan={onOpenSpan}
                />
            )}
        </RunPanel>
    )
}
