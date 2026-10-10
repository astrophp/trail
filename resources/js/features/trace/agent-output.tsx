import type { Span } from '@/api/types'
import { isAbsent } from '@/lib/payload-access'
import { agentOutput } from '@/components/telemetry/payload-shape'
import { PayloadSection } from '@/components/telemetry/payload-section'
import { WholeOutput } from '@/features/trace/whole-output'

type AgentOutputProps = { span: Span }

/** What an agent answered: its response, and the structured output when it gave one. */
export function AgentOutput({ span }: AgentOutputProps) {
    const shape = agentOutput(span.output)

    if (shape.kind === 'none') {
        return null
    }

    if (shape.kind === 'whole') {
        return <WholeOutput span={span} />
    }

    const { text, structured } = shape.value

    return (
        <div className="flex flex-col gap-6">
            <PayloadSection
                span={span}
                path="output.text"
                heading="Response"
                value={text ?? undefined}
            />
            {isAbsent(structured) ? null : (
                <PayloadSection
                    span={span}
                    path="output.structured"
                    heading="Structured output"
                    value={structured}
                />
            )}
        </div>
    )
}
