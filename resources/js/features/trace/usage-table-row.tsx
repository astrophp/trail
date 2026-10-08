import type { UsageRow } from '@/api/types'
import { AttemptLabel } from '@/components/telemetry/attempt-label'
import { CostValue } from '@/components/telemetry/cost-value'
import { SpanTypeIcon } from '@/components/telemetry/span-type-icon'
import { Button } from '@/components/ui/button'
import { TableCell, TableHead, TableRow } from '@/components/ui/table'
import { spanTitle } from '@/features/trace/span-title'
import { UsageCounts } from '@/features/trace/usage-counts'

type UsageTableRowProps = {
    row: UsageRow
    /** The name of the agent the row belongs to, when the response names it. */
    agentName: string | undefined
    /** The highest attempt among the rows; the row names its own only when that is more than one. */
    attempts: number
    /** The response has more spans than it returned, so `attempts` may understate the run's. */
    truncated: boolean
    onOpenSpan: (id: string) => void
}

/** One step or embedding: the button in its first cell opens the span in the execution view. */
export function UsageTableRow({
    row,
    agentName,
    attempts,
    truncated,
    onOpenSpan,
}: UsageTableRowProps) {
    const showAttempt = attempts > 1
    // Rows of one table share their titles: the name adds what tells them apart.
    const name = [
        spanTitle(row),
        agentName,
        showAttempt ? `attempt ${row.attempt}` : undefined,
    ]
        .filter((part) => part !== undefined)
        .join(', ')

    return (
        <TableRow>
            <TableHead scope="row" className="h-auto p-2 font-normal">
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`${name}. Open in the execution tree`}
                        className="-ms-2.5 gap-2"
                        onClick={() => onOpenSpan(row.span_id)}
                    >
                        <SpanTypeIcon type={row.type} decorative />
                        {spanTitle(row)}
                    </Button>
                    {truncated ? (
                        showAttempt ? (
                            // Without every span there is no total to say "of".
                            <span className="text-caption whitespace-nowrap text-muted-foreground">
                                Attempt {row.attempt}
                            </span>
                        ) : null
                    ) : (
                        <AttemptLabel attempt={row.attempt} of={attempts} />
                    )}
                </div>
            </TableHead>
            <TableCell>
                {row.model === null ? (
                    <span className="text-muted-foreground">Not captured</span>
                ) : (
                    <span className="font-mono text-xs">{row.model}</span>
                )}
                <span className="block text-caption text-muted-foreground">
                    {row.provider ?? 'Not captured'}
                </span>
            </TableCell>
            <UsageCounts usage={row.usage} />
            <TableCell className="text-end">
                <CostValue cost={row.cost} className="items-end" />
            </TableCell>
        </TableRow>
    )
}
