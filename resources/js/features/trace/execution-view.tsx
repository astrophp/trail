import { useCallback, useMemo, useState } from 'react'
import type { TraceDetailResponse } from '@/api/types'
import { SplitView } from '@/components/patterns/split-view'
import type { SpanTree } from '@/features/trace/build-span-tree'
import { EvidencePanel } from '@/features/trace/evidence-panel'
import { ExecutionPane } from '@/features/trace/execution-pane'
import { timingAxis } from '@/features/trace/timing-axis'
import { traceParams } from '@/features/trace/trace-params'
import type { SetUrlState } from '@/hooks/use-url-state'

type ExecutionViewProps = {
    data: TraceDetailResponse['data']
    /** The run's spans as a tree; see `buildSpanTree`. */
    tree: SpanTree
    /** The span that is selected (see `shownSelection`); `null` for a run without spans. */
    selectedId: string | null
    /** The span the URL asks for, by id; empty when it names none. */
    span: string
    /** The evidence tab the URL asks for. */
    tab: string
    setParams: SetUrlState<typeof traceParams>
    /** A span chosen in the tree. */
    onSelect: (id: string) => void
    /** The evidence's own back action on a narrow screen. */
    onBack: () => void
}

/** The workbench: in one card the execution tree and the evidence for the selected span. */
export function ExecutionView({
    data,
    tree,
    selectedId,
    span: requested,
    tab,
    setParams,
    onSelect,
    onBack,
}: ExecutionViewProps) {
    const { trace, detail, spans, usage, coverage } = data
    const axisMs = useMemo(
        () => timingAxis(trace.duration_ms, spans),
        [trace.duration_ms, spans],
    )
    const agents = useMemo(
        () => new Map(usage.agents.map((agent) => [agent.span_id, agent])),
        [usage.agents],
    )
    const selected = selectedId === null ? undefined : tree.byId.get(selectedId)
    // The span a person opened from inside the panel, whose heading takes focus when it appears.
    // A span chosen in the tree is never one: focus stays on the tree row.
    const [focusSpan, setFocusSpan] = useState<string | null>(null)
    // Selecting a span or a tab must not bury the list under history entries (see `useSpanSelection`).
    const select = useCallback(
        (id: string) => {
            setFocusSpan(null)
            onSelect(id)
        },
        [onSelect],
    )
    const selectFromPanel = useCallback(
        (id: string) => {
            setParams({ span: id }, { replace: true })
            setFocusSpan(id)
        },
        [setParams],
    )
    const focusHandled = useCallback(() => setFocusSpan(null), [])
    const run = useMemo(
        () => ({
            status: trace.status,
            pendingApprovals: detail.pending_approvals,
        }),
        [trace.status, detail.pending_approvals],
    )
    const selectTab = useCallback(
        (next: string) => {
            // The select only offers tabs; a value it does not know is left out of the URL.
            const known = traceParams.tab.parse(next)

            if (known !== undefined) {
                setParams({ tab: known }, { replace: true })
            }
        },
        [setParams],
    )

    return (
        <SplitView
            storageKey="trace-split"
            primaryLabel="Execution tree"
            secondaryLabel="Span evidence"
            backLabel="Execution tree"
            // On a narrow screen the evidence shows once a span is requested that the run has; a
            // running run may still record it, so the request stands until it settles.
            detailOpen={
                requested !== '' &&
                (tree.byId.has(requested) || trace.status === 'running')
            }
            onBack={onBack}
            defaultSize={55}
            className="overflow-hidden rounded-lg border bg-card md:h-[70dvh] md:min-h-96"
            primary={
                <ExecutionPane
                    // A new run starts expanded.
                    key={trace.id}
                    tree={tree}
                    spanCount={trace.span_count}
                    selectedId={selectedId}
                    onSelect={select}
                    agents={agents}
                    axisMs={axisMs}
                    timing={coverage.timing}
                />
            }
            secondary={
                selected ? (
                    <EvidencePanel
                        // Each span starts with its own viewers closed.
                        key={selected.span.id}
                        span={selected.span}
                        tree={tree}
                        subtotal={agents.get(selected.span.id)}
                        coverage={coverage}
                        run={run}
                        tab={tab}
                        onTabChange={selectTab}
                        onSelect={selectFromPanel}
                        focusHeading={focusSpan === selected.span.id}
                        onFocusHandled={focusHandled}
                    />
                ) : null
            }
        />
    )
}
