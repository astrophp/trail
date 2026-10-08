import { useMemo } from 'react'
import type { SpanLimit, TraceDetailResponse } from '@/api/types'
import { TokenTotals } from '@/features/trace/token-totals'
import { UsageBySpan } from '@/features/trace/usage-by-span'

type UsageViewProps = {
    data: TraceDetailResponse['data']
    spanLimit: SpanLimit
    onOpenSpan: (id: string) => void
}

/** The usage tab: the run's totals and cost as the server counted them, then what each step used. */
export function UsageView({ data, spanLimit, onOpenSpan }: UsageViewProps) {
    const { usage, spans } = data
    // How many failover attempts the run made: the highest one among its spans.
    const attempts = useMemo(
        () => spans.reduce((most, span) => Math.max(most, span.attempt), 1),
        [spans],
    )

    return (
        <div className="grid items-start gap-6 md:grid-cols-3">
            <TokenTotals
                usage={usage.totals.usage}
                cost={usage.totals.cost}
                rows={usage.rows}
                spanLimit={spanLimit}
                className="md:col-span-1"
            />
            <UsageBySpan
                usage={usage}
                spanLimit={spanLimit}
                attempts={attempts}
                onOpenSpan={onOpenSpan}
                className="md:col-span-2"
            />
        </div>
    )
}
