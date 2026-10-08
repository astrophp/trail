import { useMemo, useState } from 'react'
import type { AgentSubtotal, CoverageItem, Span } from '@/api/types'
import { buildSpanTree } from '@/features/trace/build-span-tree'
import { ExecutionPane } from '@/features/trace/execution-pane'
import { timingAxis } from '@/features/trace/timing-axis'

type PaneHarnessProps = {
    spans: Span[]
    initial?: string
    onSelect?: (id: string) => void
    runDurationMs?: number | null
    timing?: CoverageItem
}

const captured: CoverageItem = {
    state: 'captured',
    captured: 1,
    expected: 1,
    reason: null,
}

const noAgents = new Map<string, AgentSubtotal>()

/** The whole left pane: toolbar, search, filter, column labels, tree and notes. */
export function PaneHarness({
    spans,
    initial,
    onSelect,
    runDurationMs = null,
    timing = captured,
}: PaneHarnessProps) {
    const tree = useMemo(() => buildSpanTree(spans), [spans])
    const axisMs = useMemo(
        () => timingAxis(runDurationMs, spans),
        [runDurationMs, spans],
    )
    const [selected, setSelected] = useState<string | null>(
        initial ?? tree.roots[0]?.id ?? null,
    )

    return (
        <ExecutionPane
            tree={tree}
            spanCount={spans.length}
            selectedId={selected}
            onSelect={(id) => {
                setSelected(id)
                onSelect?.(id)
            }}
            agents={noAgents}
            axisMs={axisMs}
            timing={timing}
        />
    )
}
