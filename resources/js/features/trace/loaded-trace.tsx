import { useCallback, useMemo } from 'react'
import type { TraceDetailResponse } from '@/api/types'
import { buildSpanTree } from '@/features/trace/build-span-tree'
import { resolveSelection } from '@/features/trace/resolve-selection'
import { SpanFacts } from '@/features/trace/span-facts'
import { SpanTree } from '@/features/trace/span-tree'
import { TraceHeader } from '@/features/trace/trace-header'
import { traceParams } from '@/features/trace/trace-params'
import { useUrlState } from '@/hooks/use-url-state'

type LoadedTraceProps = {
    data: TraceDetailResponse['data']
    onBookmarkChange: (bookmarked: boolean) => void
}

/** A run that has loaded: its header, the execution tree and the selected span's facts. */
export function LoadedTrace({ data, onBookmarkChange }: LoadedTraceProps) {
    const { trace, detail, spans, usage } = data
    const [{ span: requested }, setParams] = useUrlState(traceParams)
    // Built once per response, not per render.
    const tree = useMemo(() => buildSpanTree(spans), [spans])
    const agents = useMemo(
        () => new Map(usage.agents.map((agent) => [agent.span_id, agent])),
        [usage.agents],
    )
    const selectedId = useMemo(
        () => resolveSelection(tree, requested, trace.status),
        [tree, requested, trace.status],
    )
    const selected = selectedId === null ? undefined : tree.byId.get(selectedId)
    // Selecting a span must not bury the list under history entries.
    const select = useCallback(
        (id: string) => setParams({ span: id }, { replace: true }),
        [setParams],
    )

    return (
        <div className="flex flex-col gap-6">
            <TraceHeader
                trace={trace}
                error={detail.error}
                onBookmarkChange={onBookmarkChange}
            />
            <div className="grid items-start gap-4 wide:grid-cols-5">
                <SpanTree
                    // A new run starts expanded.
                    key={trace.id}
                    tree={tree}
                    selectedId={selectedId}
                    onSelect={select}
                    agents={agents}
                    className="wide:col-span-3"
                />
                {selected ? (
                    <SpanFacts
                        span={selected.span}
                        attempts={tree.attempts}
                        subtotal={agents.get(selected.span.id)}
                        className="wide:col-span-2"
                    />
                ) : null}
            </div>
        </div>
    )
}
