import type { IssueKind } from '@/api/types'
import { issueKindLabels } from '@/components/telemetry/issue-kind-labels'

type IssueLabelProps = {
    kind: IssueKind
    className?: string
}

/** What went wrong with a run, in words. */
export function IssueLabel({ kind, className }: IssueLabelProps) {
    return (
        <span data-slot="issue-label" className={className}>
            {issueKindLabels[kind]}
        </span>
    )
}
