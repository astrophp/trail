import { InfoIcon } from 'lucide-react'
import { memo } from 'react'
import type { AgentSubtotal } from '@/api/types'
import type { SpanTree as Tree } from '@/features/trace/build-span-tree'
import { CountTag } from '@/features/trace/count-tag'
import { rightColumn } from '@/features/trace/span-row'
import { SpanTree } from '@/features/trace/span-tree'
import { formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'

type ExecutionPaneProps = {
    tree: Tree
    /** How many spans the run has, as the server counts them. */
    spanCount: number
    selectedId: string | null
    onSelect: (id: string) => void
    /** The server's subtotal for each agent span, by span id. */
    agents: ReadonlyMap<string, AgentSubtotal>
    className?: string
}

/**
 * The left half of the workbench: a title with the span count, the column labels, the execution
 * tree, and a note on what the durations mean. The right column of the rows is the one the column
 * label names; the toolbar has room at its end for controls of the tree. Memoised, so a change of
 * the evidence tab does not render the tree again.
 */
export const ExecutionPane = memo(function ExecutionPane({
    tree,
    spanCount,
    selectedId,
    onSelect,
    agents,
    className,
}: ExecutionPaneProps) {
    return (
        <div
            data-slot="execution-pane"
            className={cn('flex h-full min-h-0 flex-col', className)}
        >
            <div className="flex items-center gap-2 px-4 pt-4 pb-3">
                <h2 className="text-ui font-semibold">Execution</h2>
                <CountTag>
                    {formatCount(spanCount)}{' '}
                    {spanCount === 1 ? 'span' : 'spans'}
                </CountTag>
            </div>
            <div
                aria-hidden="true"
                className="flex items-center gap-3 border-y bg-muted px-4 py-2 text-caption text-muted-foreground"
            >
                <span className="min-w-0 flex-1">Span</span>
                <span className={cn(rightColumn, 'text-end')}>Duration</span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
                <SpanTree
                    tree={tree}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    agents={agents}
                />
            </div>
            <p className="flex items-start gap-1.5 border-t px-4 py-3 text-caption text-muted-foreground">
                <InfoIcon
                    aria-hidden="true"
                    className="mt-px size-3 shrink-0"
                />
                Parent durations include their children.
            </p>
        </div>
    )
})
