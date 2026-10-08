import type { Span } from '@/api/types'
import { toolOutput } from '@/components/telemetry/payload-shape'
import { PayloadSection } from '@/components/telemetry/payload-section'
import { WholeOutput } from '@/features/trace/whole-output'

type ToolOutputProps = { span: Span }

/** What a tool returned. */
export function ToolOutput({ span }: ToolOutputProps) {
    const shape = toolOutput(span.output)

    if (shape.kind === 'none') {
        return null
    }

    if (shape.kind === 'whole') {
        return <WholeOutput span={span} />
    }

    return (
        <PayloadSection
            span={span}
            path="output.result"
            heading="Result"
            value={shape.value.result}
        />
    )
}
