import type { AgentSubtotal, Coverage, Span } from '@/api/types'
import type { SpanTree } from '@/features/trace/build-span-tree'
import type { TabId } from '@/features/trace/evidence-tabs'
import { InputPanel } from '@/features/trace/input-panel'
import { MetadataPanel } from '@/features/trace/metadata-panel'
import { OutputPanel } from '@/features/trace/output-panel'
import type { RunContext } from '@/features/trace/tool-call-status'
import { RawPanel } from '@/features/trace/raw-panel'

type EvidenceBodyProps = {
    tab: TabId
    span: Span
    tree: SpanTree
    subtotal: AgentSubtotal | undefined
    coverage: Coverage
    run: RunContext
    onSelect: (id: string) => void
}

/** The content of one evidence tab. */
export function EvidenceBody({
    tab,
    span,
    tree,
    subtotal,
    coverage,
    run,
    onSelect,
}: EvidenceBodyProps) {
    switch (tab) {
        case 'input':
            return <InputPanel span={span} coverage={coverage} />
        case 'output':
            return (
                <OutputPanel
                    span={span}
                    tree={tree}
                    run={run}
                    onSelect={onSelect}
                />
            )
        case 'metadata':
            return (
                <MetadataPanel
                    span={span}
                    subtotal={subtotal}
                    coverage={coverage}
                />
            )
        case 'raw':
            return <RawPanel span={span} />
    }
}
