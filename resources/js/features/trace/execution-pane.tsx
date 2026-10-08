import {
    ChevronsDownUpIcon,
    ChevronsUpDownIcon,
    InfoIcon,
    SearchXIcon,
    TriangleAlertIcon,
} from 'lucide-react'
import { memo, useId, useMemo } from 'react'
import type { AgentSubtotal, CoverageItem } from '@/api/types'
import { EmptyState } from '@/components/patterns/empty-state'
import { SearchField } from '@/components/patterns/search-field'
import { ToggleFilter } from '@/components/patterns/toggle-filter'
import { Button } from '@/components/ui/button'
import type { SpanTree as Tree } from '@/features/trace/build-span-tree'
import { CountTag } from '@/features/trace/count-tag'
import { isProblem } from '@/features/trace/filter-tree'
import { durationWidth, rightColumn } from '@/features/trace/span-row'
import { SpanTree } from '@/features/trace/span-tree'
import { TimeAxis } from '@/features/trace/time-axis'
import { useTreeView } from '@/features/trace/use-tree-view'
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
    /** The length of the time axis the bars are drawn on; see `timingAxis`. */
    axisMs: number | null
    /** How much of the run's timing the server captured. */
    timing: CoverageItem
    className?: string
}

/** The words for what a clear action clears, by what is on. */
function clearLabel(query: string, problemsOnly: boolean) {
    if (query.trim() === '') {
        return 'Clear filter'
    }

    return problemsOnly ? 'Clear search and filter' : 'Clear search'
}

/**
 * The left half of the workbench: a title with the span count and the control that opens and closes
 * every row, a search and a filter, the column labels with the time axis, the execution tree, and
 * notes under it. Search and filter are view state of the tree: the selected span, the URL and the
 * evidence are not touched by them. Memoised, so a change of the evidence tab does not render the
 * tree again.
 */
export const ExecutionPane = memo(function ExecutionPane({
    tree,
    spanCount,
    selectedId,
    onSelect,
    agents,
    axisMs,
    timing,
    className,
}: ExecutionPaneProps) {
    const hintId = useId()
    const view = useTreeView(tree, selectedId)
    const { rows, filtering, query, problemsOnly } = view
    const problems = useMemo(
        () => tree.nodes.filter((node) => isProblem(node.span)).length,
        [tree],
    )
    const shown = useMemo(
        () => rows.filter((row) => row.kind === 'span').length,
        [rows],
    )
    const CollapseIcon = view.anyOpen ? ChevronsDownUpIcon : ChevronsUpDownIcon
    const running = useMemo(
        () => tree.nodes.some((node) => node.span.status === 'running'),
        [tree],
    )
    const toggleAllBase = view.anyOpen ? 'Collapse all' : 'Expand all'
    const canToggleAll = !filtering && view.hasParents
    const toggleAllLabel = filtering
        ? `${toggleAllBase} (unavailable while filtering)`
        : view.hasParents
          ? toggleAllBase
          : `${toggleAllBase} (no rows have anything under them)`
    const gap = timing.state === 'partial' || timing.state === 'not_captured'

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
                    {/* A live region from the start, so typing in the search is announced. */}
                    <span role="status">
                        {filtering ? (
                            <>
                                <span aria-hidden="true">
                                    {' · '}
                                    {formatCount(shown)} shown
                                </span>
                                <span className="sr-only">
                                    {formatCount(shown)}{' '}
                                    {shown === 1 ? 'span' : 'spans'} shown, with
                                    the parents of matches
                                </span>
                            </>
                        ) : null}
                    </span>
                </CountTag>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={toggleAllLabel}
                    aria-disabled={!canToggleAll}
                    title={toggleAllLabel}
                    onClick={view.toggleAll}
                    className="ml-auto aria-disabled:opacity-50"
                >
                    <CollapseIcon aria-hidden="true" />
                </Button>
            </div>
            <div className="flex items-center gap-2 px-4 pb-3">
                <SearchField
                    value={query}
                    onValueChange={view.setQuery}
                    aria-label="Search spans"
                    placeholder="Search spans…"
                    className="min-w-0 flex-1 md:w-auto"
                />
                <ToggleFilter
                    pressed={problemsOnly}
                    onPressedChange={view.setProblemsOnly}
                    count={problems}
                >
                    <TriangleAlertIcon aria-hidden="true" />
                    Problems only
                </ToggleFilter>
            </div>
            <div
                aria-hidden="true"
                className="flex items-center gap-3 border-y bg-muted px-4 py-2 text-caption text-muted-foreground"
            >
                <span className="min-w-0 flex-1">Span</span>
                <div className={cn(rightColumn, 'flex items-center gap-2')}>
                    <TimeAxis
                        axisMs={axisMs}
                        running={running}
                        className="hidden min-w-0 flex-1 md:block"
                    />
                    <span className={durationWidth}>Duration</span>
                </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
                <SpanTree
                    tree={tree}
                    view={view}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    agents={agents}
                    axisMs={axisMs}
                    describedBy={hintId}
                    empty={
                        <EmptyState
                            icon={SearchXIcon}
                            title="No spans match"
                            description="Nothing in this run fits the search and filter."
                            className="py-8"
                        >
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={view.clear}
                            >
                                {clearLabel(query, problemsOnly)}
                            </Button>
                        </EmptyState>
                    }
                />
            </div>
            <div className="flex flex-col gap-1 border-t px-4 py-3 text-caption text-muted-foreground">
                <p className="flex items-start gap-1.5">
                    <InfoIcon
                        aria-hidden="true"
                        className="mt-px size-3 shrink-0"
                    />
                    Parent durations include their children.
                </p>
                {gap ? (
                    <p>
                        Timing was captured for {formatCount(timing.captured)}{' '}
                        of {formatCount(timing.expected)}{' '}
                        {timing.expected === 1 ? 'span' : 'spans'}.
                    </p>
                ) : null}
                <p id={hintId}>
                    e next problem · Shift+E previous problem · * open siblings
                </p>
            </div>
        </div>
    )
})
