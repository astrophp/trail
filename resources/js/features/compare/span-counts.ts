import type { Span } from '@/api/types'

/** What a run's spans add up to; the numbers of the spans that were returned. */
export type SpanCounts = {
    agents: number
    steps: number
    tools: number
    embeddings: number
    /** The highest attempt of any span; `null` when there are no spans. */
    attempts: number | null
    failed: number
    incomplete: number
}

export function countSpans(spans: Span[]): SpanCounts {
    const ofType = (type: Span['type']) =>
        spans.filter((span) => span.type === type).length
    const ofStatus = (status: Span['status']) =>
        spans.filter((span) => span.status === status).length

    return {
        agents: ofType('agent'),
        steps: ofType('step'),
        tools: ofType('tool'),
        embeddings: ofType('embedding'),
        attempts:
            spans.length === 0
                ? null
                : Math.max(...spans.map((span) => span.attempt)),
        failed: ofStatus('failed'),
        incomplete: ofStatus('incomplete'),
    }
}
