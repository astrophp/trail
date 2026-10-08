import type { Coverage, Span } from '@/api/types'
import { AgentInput } from '@/features/trace/agent-input'
import { EmbeddingInput } from '@/features/trace/embedding-input'
import { StepInput } from '@/features/trace/step-input'
import { ToolInput } from '@/features/trace/tool-input'

type InputPanelProps = { span: Span; coverage: Coverage }

/** What the span was given, laid out for its type. */
export function InputPanel({ span, coverage }: InputPanelProps) {
    switch (span.type) {
        case 'agent':
            return <AgentInput span={span} coverage={coverage} />
        case 'step':
            return <StepInput span={span} />
        case 'tool':
            return <ToolInput span={span} />
        case 'embedding':
            return <EmbeddingInput span={span} />
    }
}
