import { useEffect, useRef } from 'react'
import type { AgentSubtotal, Coverage, Span } from '@/api/types'
import { Notice } from '@/components/patterns/notice'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { SpanTree } from '@/features/trace/build-span-tree'
import { childAgent } from '@/features/trace/child-agent'
import { emptyReason } from '@/features/trace/empty-reason'
import { EvidenceBody } from '@/features/trace/evidence-body'
import {
    activeTab,
    availableTabs,
    tabLabels,
} from '@/features/trace/evidence-tabs'
import { truncationUnseen } from '@/features/trace/payload-truncation'
import { SpanFailure } from '@/features/trace/span-failure'
import type { RunContext } from '@/features/trace/tool-call-status'
import { SpanHeader } from '@/features/trace/span-header'
import { cn } from '@/lib/utils'

/** The tabs as an underlined row on a full-width rule: the active one in the primary ink, with a 2px line over the rule. */
const tabList =
    'h-auto w-full justify-start gap-5.5 rounded-none border-b p-0 px-6 group-data-horizontal/tabs:h-auto'
const tabTrigger =
    'h-auto flex-none rounded-none px-0 pt-2.5 pb-3 text-ui text-muted-foreground group-data-horizontal/tabs:after:-bottom-px data-active:text-primary-ink dark:data-active:text-primary-ink after:bg-primary'

type EvidencePanelProps = {
    span: Span
    tree: SpanTree
    /** The server's subtotal for this span, when it is an agent. */
    subtotal: AgentSubtotal | undefined
    coverage: Coverage
    /** The run's status and pending approvals, which say why a tool call has no span. */
    run: RunContext
    /** The tab the URL asks for; the span's first tab when it does not have that one. */
    tab: string
    onTabChange: (tab: string) => void
    onSelect: (id: string) => void
    /** This span was opened from inside the panel (a crumb, a link to another span): focus goes to its heading. */
    focusHeading?: boolean
    /** Called once focus has moved, so the page forgets the request. */
    onFocusHandled?: () => void
    className?: string
}

/**
 * The proof for one span: what it sent, received and cost. The tabs are the ones the span has
 * something for, so none is empty; a span with nothing stored says why instead.
 */
export function EvidencePanel({
    span,
    tree,
    subtotal,
    coverage,
    run,
    tab,
    onTabChange,
    onSelect,
    focusHeading = false,
    onFocusHandled,
    className,
}: EvidencePanelProps) {
    const panel = useRef<HTMLDivElement>(null)
    const heading = useRef<HTMLHeadingElement>(null)

    const available = availableTabs(span)
    const active = activeTab(tab, available)
    const started = span.type === 'tool' ? childAgent(tree, span) : undefined
    const empty = !available.includes('input') && !available.includes('output')

    // Opening another span from in here replaces this panel: put focus where the new one begins,
    // and its pane back at the top. A span chosen in the tree leaves focus on the tree.
    useEffect(() => {
        if (!focusHeading) {
            return
        }

        heading.current?.focus()

        if (panel.current?.parentElement) {
            panel.current.parentElement.scrollTop = 0
        }

        onFocusHandled?.()
    }, [focusHeading, onFocusHandled])

    return (
        <div
            ref={panel}
            data-slot="evidence-panel"
            className={cn('flex min-w-0 flex-col', className)}
        >
            <SpanHeader
                span={span}
                tree={tree}
                subtotal={subtotal}
                onSelect={onSelect}
                headingRef={heading}
                className="px-6 pt-5 pb-4"
            />
            <div className="flex flex-col gap-3 px-6 pb-4 empty:hidden">
                {span.redacted ? (
                    <Notice
                        tone="info"
                        title="Parts of this span were redacted before it was stored."
                    />
                ) : null}
                <SpanFailure span={span} tree={tree} onSelect={onSelect} />
                {started ? (
                    <div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onSelect(started.id)}
                        >
                            Open the agent it started
                        </Button>
                    </div>
                ) : null}
                {empty ? (
                    <Notice
                        tone="info"
                        title={emptyReason(span, coverage.payloads)}
                    />
                ) : null}
                {truncationUnseen(span, active) ? (
                    <Notice
                        tone="warning"
                        title="Part of this span was cut short when it was stored."
                    />
                ) : null}
            </div>
            <Tabs value={active} onValueChange={onTabChange} className="gap-0">
                <TabsList
                    variant="line"
                    aria-label="Evidence"
                    className={tabList}
                >
                    {available.map((id) => (
                        <TabsTrigger key={id} value={id} className={tabTrigger}>
                            {tabLabels[id]}
                        </TabsTrigger>
                    ))}
                </TabsList>
                <TabsContent value={active} className="min-w-0 px-6 py-5">
                    <EvidenceBody
                        tab={active}
                        span={span}
                        tree={tree}
                        subtotal={subtotal}
                        coverage={coverage}
                        run={run}
                        onSelect={onSelect}
                    />
                </TabsContent>
            </Tabs>
        </div>
    )
}
