import type { Span } from '@/api/types'
import type { SpanTree } from '@/features/trace/build-span-tree'
import { AgentOutput } from '@/features/trace/agent-output'
import { EmbeddingOutput } from '@/features/trace/embedding-output'
import { StepOutput } from '@/features/trace/step-output'
import { ToolOutput } from '@/features/trace/tool-output'

type OutputPanelProps = {
    span: Span
    tree: SpanTree
    onSelect: (id: string) => void
}

/** What the span produced, laid out for its type. */
export function OutputPanel({ span, tree, onSelect }: OutputPanelProps) {
    switch (span.type) {
        case 'agent':
            return <AgentOutput span={span} />
        case 'step':
            return <StepOutput span={span} tree={tree} onSelect={onSelect} />
        case 'tool':
            return <ToolOutput span={span} />
        case 'embedding':
            return <EmbeddingOutput span={span} />
    }
}
