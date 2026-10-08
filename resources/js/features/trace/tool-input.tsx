import type { Span } from '@/api/types'
import { toolInput } from '@/features/trace/payload-shape'
import { PayloadSection } from '@/features/trace/payload-section'
import { WholeInput } from '@/features/trace/whole-input'

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
