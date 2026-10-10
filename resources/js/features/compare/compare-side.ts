import type { Trace, TraceDetailResponse } from '@/api/types'
import { countSpans, type SpanCounts } from '@/features/compare/span-counts'

/** One run as the comparison reads it. */
export type Side = {
    trace: Trace
    counts: SpanCounts
    /** Every span the run has, and how many came back; the counts by type cover those. */
    total: number
    shown: number
    truncated: boolean
}

export function sideOf({ data, span_limit }: TraceDetailResponse): Side {
    return {
        trace: data.trace,
        counts: countSpans(data.spans),
        total: span_limit.total,
        shown: data.spans.length,
        truncated: span_limit.truncated,
    }
}
