import type { IssueKind } from '@/api/types'

/** What each kind of issue is called, for a label and for a filter chip. */
export const issueKindLabels: Record<IssueKind, string> = {
    rate_limited: 'Rate limited',
    provider_overloaded: 'Provider overloaded',
    provider_connection: 'Provider connection',
    insufficient_credits: 'Insufficient credits',
    tool_error: 'Tool error',
    exception: 'Exception',
    abandoned: 'Abandoned',
}
