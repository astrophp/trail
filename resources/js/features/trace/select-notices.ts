import type { Span, SpanLimit, TraceDetailResponse } from '@/api/types'
import type { SpanTree } from '@/features/trace/build-span-tree'

/** What the page says about a run that is not a finished, ordinary one. */
export type RunNotice =
    | { kind: 'truncated'; limit: number; total: number }
    | { kind: 'running' }
    | { kind: 'incomplete'; abandoned: boolean }
    /** The tools waiting, in order and without repeats; empty when the run lists none. */
    | { kind: 'approval'; tools: string[] }
    /** `spanId`: the span to show, or `null` when the returned spans do not have it. */
    | { kind: 'recovered'; spanId: string | null }
    /** `runFailed`: the run itself failed, so it cannot be said to have carried on. */
    | { kind: 'child-failed'; spanId: string | null; runFailed: boolean }

/** The failed span of the earliest failed attempt: the one its row's "Show failure" selects. */
function failedAttemptSpan(tree: SpanTree): string | null {
    let earliest: Span | null = null

    for (const row of tree.rows) {
        if (
            row.kind === 'attempt' &&
            row.outcome === 'failed' &&
            row.failed !== null &&
            (earliest === null || row.failed.sequence < earliest.sequence)
        ) {
            earliest = row.failed
        }
    }

    return earliest?.id ?? null
}

/** The first agent span, in sequence order, that has a parent and failed. */
function failedChildAgent(spans: readonly Span[]): string | null {
    let first: Span | null = null

    for (const span of spans) {
        if (
            span.type === 'agent' &&
            span.parent_id !== null &&
            span.status === 'failed' &&
            (first === null || span.sequence < first.sequence)
        ) {
            first = span
        }
    }

    return first?.id ?? null
}

/**
 * The notices that apply to a run, in the order they are shown: a run cut at the span limit; then
 * at most one of running, incomplete and awaiting approval (they are statuses, so they exclude one
 * another); then one line for each flag. `tree` is the one built from `data.spans`. An ordinary finished run has none.
 */
export function selectNotices(
    data: TraceDetailResponse['data'],
    spanLimit: SpanLimit,
    tree: SpanTree,
): RunNotice[] {
    const { trace, detail, spans } = data
    const notices: RunNotice[] = []

    if (spanLimit.truncated) {
        notices.push({
            kind: 'truncated',
            limit: spanLimit.limit,
            total: spanLimit.total,
        })
    }

    if (trace.status === 'running') {
        notices.push({ kind: 'running' })
    } else if (trace.status === 'incomplete') {
        notices.push({
            kind: 'incomplete',
            abandoned: trace.issue_kind === 'abandoned',
        })
    } else if (trace.status === 'awaiting_approval') {
        notices.push({
            kind: 'approval',
            tools: [
                ...new Set(detail.pending_approvals.map((item) => item.tool)),
            ],
        })
    }

    if (trace.recovered) {
        notices.push({
            kind: 'recovered',
            spanId: failedAttemptSpan(tree),
        })
    }

    if (trace.child_failed) {
        notices.push({
            kind: 'child-failed',
            spanId: failedChildAgent(spans),
            runFailed: trace.status === 'failed',
        })
    }

    return notices
}
