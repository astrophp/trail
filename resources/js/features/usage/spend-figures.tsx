import type { ReactNode } from 'react'
import type { UsageSpendResponse } from '@/api/types'
import { CostValue } from '@/components/telemetry/cost-value'
import { formatCost } from '@/lib/format'
import { cn } from '@/lib/utils'

type SpendFiguresProps = {
    data: UsageSpendResponse['data']
    /** The length of the period the projection covers, in words: "24 hours". */
    period: string
    className?: string
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex flex-col">
            <dt className="text-caption text-muted-foreground">{label}</dt>
            <dd className="text-ui font-medium">{children}</dd>
        </div>
    )
}

/**
 * The two figures of the chart's header: what was recorded through the last bucket, with its
 * state, and, only when there is a projection, what it adds for the next period. The projected
 * figure is told apart in its words and carries a "+": it is an addition that has not happened.
 */
export function SpendFigures({ data, period, className }: SpendFiguresProps) {
    const last = data.series.buckets.at(-1)
    const { projection } = data

    return (
        <dl
            data-slot="spend-figures"
            className={cn('flex flex-wrap gap-x-6 gap-y-2', className)}
        >
            {last === undefined ? null : (
                <Figure label="Recorded">
                    <CostValue cost={last.cumulative} pendingAmount="show" />
                </Figure>
            )}
            {projection.state === 'projected' ? (
                <Figure label={`Projected, next ${period}`}>
                    <span className="tabular-nums">{`+${formatCost(projection.total)}`}</span>
                </Figure>
            ) : null}
        </dl>
    )
}
