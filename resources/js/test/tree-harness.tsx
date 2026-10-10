import { useMemo, useState } from 'react'
import type { AgentSubtotal, Span } from '@/api/types'
import { buildSpanTree } from '@/features/trace/build-span-tree'
import { SpanTree } from '@/features/trace/span-tree'
import { timingAxis } from '@/features/trace/timing-axis'
import { useTreeView } from '@/features/trace/use-tree-view'

type HarnessProps = {
    spans: Span[]
    initial?: string
    onSelect?: (id: string) => void
    runDurationMs?: number | null
}

const noAgents = new Map<string, AgentSubtotal>()

/** The bare tree with a selection of its own, as the page keeps one in the URL. */
export function TreeHarness({
    spans,
    initial,
    onSelect,
    runDurationMs = null,
}: HarnessProps) {
    const tree = useMemo(() => buildSpanTree(spans), [spans])
    const axisMs = useMemo(
        () => timingAxis(runDurationMs, spans),
        [runDurationMs, spans],
    )
    const [selected, setSelected] = useState<string | null>(
        initial ?? tree.roots[0]?.id ?? null,
    )
    const view = useTreeView(tree, selected)

    return (
        <SpanTree
            tree={tree}
            view={view}
            selectedId={selected}
            onSelect={(id) => {
                setSelected(id)
                onSelect?.(id)
            }}
            agents={noAgents}
            axisMs={axisMs}
        />
    )
}
