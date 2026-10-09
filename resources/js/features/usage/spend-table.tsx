import type { UsageSpendResponse } from '@/api/types'
import type { ChartBucket } from '@/components/patterns/time-series-chart'
import { CostValue } from '@/components/telemetry/cost-value'
import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { spendTableCaption } from '@/features/usage/spend-words'
import { formatCost } from '@/lib/format'
import { cn } from '@/lib/utils'

type SpendTableProps = {
    data: UsageSpendResponse['data']
    /** The full label of a bucket, as the chart words it. */
    formatBucket: (bucket: ChartBucket) => string
    className?: string
}

const inProgressWords = 'in progress'

const bucketOf = (
    bucket: {
        from: string
        to: string
    },
    inProgress: boolean,
): ChartBucket => ({
    key: bucket.from,
    from: new Date(bucket.from),
    to: new Date(bucket.to),
    inProgress,
})

/** A cell a column does not apply to: empty, never a 0 and never "Not captured". */
const NotApplicable = () => <TableCell data-slot="not-applicable" />

/**
 * The numbers behind the chart of the estimated cost: a row for each recorded bucket and then one
 * for each projected bucket. Recorded amounts (per bucket, and cumulative) and projected ones
 * (per bucket, and where the line continues) are separate columns, and a cell where a column does
 * not apply is empty, so a projection is never read as a cost nor a cost as a projection. Recorded
 * amounts say their state, as everywhere.
 */
export function SpendTable({ data, formatBucket, className }: SpendTableProps) {
    const { series, projection } = data
    const projected = projection.state === 'projected' ? projection.buckets : []

    return (
        <Table data-slot="spend-table" className={cn(className)}>
            <TableCaption className="sr-only">
                {spendTableCaption(series.bucket)}
            </TableCaption>
            <TableHeader>
                <TableRow>
                    <TableHead scope="col">Time</TableHead>
                    <TableHead scope="col" className="text-right">
                        Recorded estimated cost
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                        Recorded estimated cost, cumulative
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                        Projected amount
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                        Projected line
                    </TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {series.buckets.map((bucket) => (
                    <TableRow key={`recorded:${bucket.from}`}>
                        <TableHead scope="row" className="font-normal">
                            {formatBucket(bucketOf(bucket, bucket.in_progress))}
                            {bucket.in_progress ? (
                                <span className="text-muted-foreground">
                                    {` (${inProgressWords})`}
                                </span>
                            ) : null}
                        </TableHead>
                        <TableCell className="text-right">
                            <CostValue
                                cost={bucket.cost}
                                pendingAmount="show"
                                className="items-end"
                            />
                        </TableCell>
                        <TableCell className="text-right">
                            <CostValue
                                cost={bucket.cumulative}
                                pendingAmount="show"
                                className="items-end"
                            />
                        </TableCell>
                        <NotApplicable />
                        <NotApplicable />
                    </TableRow>
                ))}
                {projected.map((bucket) => (
                    <TableRow key={`projected:${bucket.from}`}>
                        <TableHead scope="row" className="font-normal">
                            {formatBucket(bucketOf(bucket, false))}
                            <span className="text-muted-foreground">
                                {' (projected)'}
                            </span>
                        </TableHead>
                        <NotApplicable />
                        <NotApplicable />
                        <TableCell className="text-right tabular-nums">
                            {formatCost(bucket.amount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                            {formatCost(bucket.cumulative)}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    )
}
