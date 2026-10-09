import { useEffect, useMemo } from 'react'
import type { TracesLinkerFor } from '@/api/traces-link'
import type { AttentionItem } from '@/api/types'
import { AttentionCell } from '@/components/telemetry/attention-cell'
import {
    readAttention,
    unreadable,
} from '@/components/telemetry/attention-items'
import type { TimeRangePreset } from '@/lib/time-range'
import { cn } from '@/lib/utils'

type AttentionCellsProps = {
    items: AttentionItem[]
    /** The range the items were counted over, which every link follows. */
    range: TimeRangePreset
    /**
     * Builds the link to the runs behind an item from the filters the API named for it. It throws
     * for a filter the traces list would not keep, and that item is drawn as one that could not be
     * shown rather than as a link to other runs.
     */
    linkFor: TracesLinkerFor
    className?: string
}

/**
 * What needs a look, as the cells of a grid in the API's order, left to right and top to bottom.
 * The grid takes the width of the container it is in (give that container `@container`). A cell
 * is a link to its runs; a failed one lists its issue kinds beneath, each a link of its own. An
 * item this client cannot word or link says so, with its count, and has no link.
 */
export function AttentionCells({
    items,
    range,
    linkFor,
    className,
}: AttentionCellsProps) {
    const entries = useMemo(
        () => readAttention(items, range, linkFor),
        [items, range, linkFor],
    )
    const unreadableReport = unreadable(entries).join('\n')

    useEffect(() => {
        // A bug to fix, not a state of the data: say so once where a developer looks.
        if (unreadableReport !== '' && import.meta.env.DEV) {
            console.error(
                `Trail could not show every item of what needs attention:\n${unreadableReport}`,
            )
        }
    }, [unreadableReport])

    return (
        // Safari drops the list semantics of a list whose markers a reset removes.
        // eslint-disable-next-line jsx-a11y/no-redundant-roles
        <ul
            role="list"
            data-slot="attention-grid"
            className={cn(
                'grid gap-2 @2xl:grid-cols-2 @4xl:grid-cols-3',
                className,
            )}
        >
            {entries.map((entry, index) => (
                <AttentionCell key={`${entry.kind}:${index}`} entry={entry} />
            ))}
        </ul>
    )
}
