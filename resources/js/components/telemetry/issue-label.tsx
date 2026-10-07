import type { IssueKind } from '@/api/types'

const labels: Record<IssueKind, string> = {
    rate_limited: 'Rate limited',
    provider_overloaded: 'Provider overloaded',
    provider_connection: 'Provider connection',
    insufficient_credits: 'Insufficient credits',
    tool_error: 'Tool error',
    exception: 'Exception',
    abandoned: 'Abandoned',
}

type IssueLabelProps = {
    kind: IssueKind
    className?: string
}

/** What went wrong with a run, in words. */
export function IssueLabel({ kind, className }: IssueLabelProps) {
    return (
        <span data-slot="issue-label" className={className}>
            {labels[kind]}
        </span>
    )
}
