import type { Span } from '@/api/types'
import { toolInput } from '@/components/telemetry/payload-shape'
import { PayloadSection } from '@/components/telemetry/payload-section'
import { WholeInput } from '@/components/telemetry/whole-input'

type ToolInputProps = { span: Span }

/** The arguments a tool was called with. */
export function ToolInput({ span }: ToolInputProps) {
    const shape = toolInput(span.input)

    if (shape.kind === 'none') {
        return null
    }

    if (shape.kind === 'whole') {
        return <WholeInput span={span} />
    }

    return (
        <PayloadSection
            span={span}
            path="input.arguments"
            heading="Arguments"
            value={shape.value.arguments}
        />
    )
}
