import { useCallback, useEffect, useRef, useState } from 'react'
import type { SpanLimit, TraceDetailResponse } from '@/api/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ExecutionView } from '@/features/trace/execution-view'
import { RunMetadata } from '@/features/trace/run-metadata'
import { tabList, tabTrigger } from '@/features/trace/tab-styles'
import { TraceHeader } from '@/features/trace/trace-header'
import {
    traceParams,
    viewIds,
    type ViewId,
} from '@/features/trace/trace-params'
import { UsageView } from '@/features/trace/usage-view'
import { useUrlState } from '@/hooks/use-url-state'
import { cn } from '@/lib/utils'

type LoadedTraceProps = {
    data: TraceDetailResponse['data']
    spanLimit: SpanLimit
    onBookmarkChange: (bookmarked: boolean) => void
}

const viewLabels: Record<ViewId, string> = {
    execution: 'Execution',
    usage: 'Usage',
    metadata: 'Metadata',
}

/** A run that has loaded: its header, then the view of it the URL asks for. */
export function LoadedTrace({
    data,
    spanLimit,
    onBookmarkChange,
}: LoadedTraceProps) {
    const { trace, detail } = data
    const [{ view, span, tab }, setParams] = useUrlState(traceParams)
    const selectView = useCallback(
        (next: string) => {
            const known = traceParams.view.parse(next)

            if (known !== undefined) {
                setParams({ view: known }, { replace: true })
            }
        },
        [setParams],
    )
    const execution = useRef<HTMLDivElement>(null)
    // The span opened from the usage table, whose row in the tree takes focus once it is shown.
    const [focusRow, setFocusRow] = useState<string | null>(null)
    // One write: the view goes back to the tree and the span is the one chosen.
    const openSpan = useCallback(
        (id: string) => {
            setParams({ view: 'execution', span: id }, { replace: true })
            setFocusRow(id)
        },
        [setParams],
    )

    // The table that held focus is gone: without this, focus would fall to the page.
    useEffect(() => {
        if (focusRow === null || view !== 'execution') {
            return
        }

        const rows =
            execution.current?.querySelectorAll<HTMLElement>(
                '[role="treeitem"]',
            )

        const target = Array.from(rows ?? []).find(
            (row) => row.dataset.spanId === focusRow,
        )

        if (target) {
            target.focus()
            setFocusRow(null)
        }
    }, [focusRow, view, span])

    return (
        <div className="flex flex-col gap-6">
            <TraceHeader
                trace={trace}
                error={detail.error}
                onBookmarkChange={onBookmarkChange}
            />
            <Tabs value={view} onValueChange={selectView} className="gap-6">
                <TabsList
                    variant="line"
                    aria-label="Run views"
                    className={cn(tabList, 'px-0')}
                >
                    {viewIds.map((id) => (
                        <TabsTrigger key={id} value={id} className={tabTrigger}>
                            {viewLabels[id]}
                        </TabsTrigger>
                    ))}
                </TabsList>
                {/* Kept in the page while another view shows, so the tree keeps what was opened and searched. */}
                <TabsContent
                    ref={execution}
                    value="execution"
                    forceMount
                    hidden={view !== 'execution'}
                >
                    <ExecutionView
                        data={data}
                        span={span}
                        tab={tab}
                        setParams={setParams}
                    />
                </TabsContent>
                <TabsContent value="usage">
                    <UsageView
                        data={data}
                        spanLimit={spanLimit}
                        onOpenSpan={openSpan}
                    />
                </TabsContent>
                <TabsContent value="metadata">
                    <RunMetadata data={data} spanLimit={spanLimit} />
                </TabsContent>
            </Tabs>
        </div>
    )
}
