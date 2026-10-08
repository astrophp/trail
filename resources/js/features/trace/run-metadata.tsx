import type { SpanLimit, TraceDetailResponse } from '@/api/types'
import { CaptureCoverage } from '@/features/trace/capture-coverage'
import { PendingApprovals } from '@/features/trace/pending-approvals'
import { RunAttributes } from '@/features/trace/run-attributes'

type RunMetadataProps = {
    data: TraceDetailResponse['data']
    spanLimit: SpanLimit
}

/** The metadata tab: what was recorded about the run, how complete the recording is, and what a paused run waits for. */
export function RunMetadata({ data, spanLimit }: RunMetadataProps) {
    const { trace, detail, coverage } = data

    return (
        <div className="flex flex-col gap-6">
            <div className="grid items-start gap-6 md:grid-cols-2">
                <RunAttributes
                    trace={trace}
                    resolvedToolCallIds={detail.resolved_tool_call_ids}
                />
                <CaptureCoverage coverage={coverage} spanLimit={spanLimit} />
            </div>
            {detail.pending_approvals.length === 0 ? null : (
                <PendingApprovals approvals={detail.pending_approvals} />
            )}
        </div>
    )
}
