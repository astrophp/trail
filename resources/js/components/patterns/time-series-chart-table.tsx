import type { ChartModel } from '@/components/patterns/time-series-chart-model'
import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

type TimeSeriesChartTableProps = {
    model: ChartModel
    /** What the table is: the caption. */
    caption: string
    /** The name of the column of bucket labels. */
    bucketColumnLabel: string
    /** Drawn for a value that was not captured. */
    missingLabel: string
    /** The words that mark a bucket still filling. */
    inProgressLabel: string
    formatValue: (value: number, seriesKey: string) => string
    className?: string
}

/** The numbers of a `TimeSeriesChart` as a table: a row per bucket, a column per series. */
export function TimeSeriesChartTable({
    model,
    caption,
    bucketColumnLabel,
    missingLabel,
    inProgressLabel,
    formatValue,
    className,
}: TimeSeriesChartTableProps) {
    return (
        <Table data-slot="time-series-chart-table" className={cn(className)}>
            <TableCaption className="sr-only">{caption}</TableCaption>
            <TableHeader>
                <TableRow>
                    <TableHead scope="col">{bucketColumnLabel}</TableHead>
                    {model.series.map((series) => (
                        <TableHead
                            key={series.key}
                            scope="col"
                            className="text-right"
                        >
                            {series.label}
                        </TableHead>
                    ))}
                </TableRow>
            </TableHeader>
            <TableBody>
                {model.rows.map((row, rowIndex) => (
                    <TableRow key={`${rowIndex}:${row.key}`}>
                        <TableHead scope="row" className="font-normal">
                            {row.label}
                            {row.inProgress ? (
                                <span className="text-muted-foreground">
                                    {` (${inProgressLabel})`}
                                </span>
                            ) : null}
                        </TableHead>
                        {model.series.map((series, index) => {
                            const value = row.values[index] ?? null

                            // A series that has nothing to say about this bucket leaves its cell empty.
                            if (row.reported[index] === false) {
                                return <TableCell key={series.key} />
                            }

                            return (
                                <TableCell
                                    key={series.key}
                                    className={cn(
                                        'text-right tabular-nums',
                                        value === null &&
                                            'text-muted-foreground',
                                    )}
                                >
                                    {value === null
                                        ? missingLabel
                                        : formatValue(value, series.key)}
                                </TableCell>
                            )
                        })}
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    )
}
