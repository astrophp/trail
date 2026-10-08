import { useCallback, useMemo, useState } from 'react'
import type { TraceDetailResponse } from '@/api/types'
import { SplitView } from '@/components/patterns/split-view'
import { buildSpanTree } from '@/features/trace/build-span-tree'
import { ExecutionPane } from '@/features/trace/execution-pane'
import { EvidencePanel } from '@/features/trace/evidence-panel'
import { resolveSelection } from '@/features/trace/resolve-selection'
import { TraceHeader } from '@/features/trace/trace-header'
import { timingAxis } from '@/features/trace/timing-axis'
import { traceParams } from '@/features/trace/trace-params'
import { useUrlState } from '@/hooks/use-url-state'

type LoadedTraceProps = {
    data: TraceDetailResponse['data']
    onBookmarkChange: (bookmarked: boolean) => void
}

/** A run that has loaded: its header, and in one card the execution tree and the evidence for the selected span. */
export function LoadedTrace({ data, onBookmarkChange }: LoadedTraceProps) {
    const { trace, detail, spans, usage, coverage } = data
    const [{ span: requested, tab }, setParams] = useUrlState(traceParams)
    // Built once per response, not per render.
    const tree = useMemo(() => buildSpanTree(spans), [spans])
    const axisMs = useMemo(
        () => timingAxis(trace.duration_ms, spans),
        [trace.duration_ms, spans],
    )
    const agents = useMemo(
        () => new Map(usage.agents.map((agent) => [agent.span_id, agent])),
        [usage.agents],
    )
    const selectedId = useMemo(
        () => resolveSelection(tree, requested, trace.status),
        [tree, requested, trace.status],
    )
    const selected = selectedId === null ? undefined : tree.byId.get(selectedId)
    // The span a person opened from inside the panel, whose heading takes focus when it appears.
    // A span chosen in the tree is never one: focus stays on the tree row.
    const [focusSpan, setFocusSpan] = useState<string | null>(null)
    // Selecting a span or a tab must not bury the list under history entries.
    const select = useCallback(
        (id: string) => {
            setFocusSpan(null)
            setParams({ span: id }, { replace: true })
        },
        [setParams],
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
    const back = useCallback(
        () => setParams({ span: '' }, { replace: true }),
        [setParams],
    )

    return (
        <div className="flex flex-col gap-6">
            <TraceHeader
                trace={trace}
                error={detail.error}
                onBookmarkChange={onBookmarkChange}
            />
            <SplitView
                storageKey="trace-split"
                primaryLabel="Execution tree"
                secondaryLabel="Span evidence"
                backLabel="Execution tree"
                // On a narrow screen the evidence shows once a span is named in the URL.
                detailOpen={requested !== ''}
                onBack={back}
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
        </div>
    )
}
