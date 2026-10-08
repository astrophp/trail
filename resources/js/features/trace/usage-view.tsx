import { useMemo } from 'react'
import type { SpanLimit, TraceDetailResponse } from '@/api/types'
import { CostPanel } from '@/features/trace/cost-panel'
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
        <div className="flex flex-col gap-6">
            <div className="grid gap-6 md:grid-cols-2">
                <TokenTotals usage={usage.totals.usage} />
                <CostPanel
                    cost={usage.totals.cost}
                    rows={usage.rows}
                    spanLimit={spanLimit}
                />
            </div>
            <UsageBySpan
                usage={usage}
                spanLimit={spanLimit}
                attempts={attempts}
                onOpenSpan={onOpenSpan}
            />
        </div>
    )
}
