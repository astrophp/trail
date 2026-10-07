import type { Trace } from '@/api/types'
import { IssueLabel } from '@/components/telemetry/issue-label'
import { StatusBadge } from '@/components/telemetry/status-badge'
import { TraceFlags } from '@/components/telemetry/trace-flags'

/** How a run ended, with the notes and the issue that go with it. */
export function OutcomeCell({ trace }: { trace: Trace }) {
    return (
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
    )
}
