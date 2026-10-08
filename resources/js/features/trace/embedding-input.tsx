import type { Span } from '@/api/types'
import { KeyValue } from '@/components/patterns/key-value'
import { KeyValueList } from '@/components/patterns/key-value-list'
import { EmbeddingUsage } from '@/features/trace/embedding-usage'
import { embeddingInput } from '@/features/trace/payload-shape'
import { WholeInput } from '@/features/trace/whole-input'
import { formatCount } from '@/lib/format'

type EmbeddingInputProps = { span: Span }

/** How many texts were embedded, the size asked for, and what the call used. The texts themselves are never stored. */
export function EmbeddingInput({ span }: EmbeddingInputProps) {
    const shape = embeddingInput(span.input)

    if (shape.kind === 'none') {
        return null
    }

    if (shape.kind === 'whole') {
        return <WholeInput span={span} />
    }

    const { count, dimensions } = shape.value

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
                <KeyValueList layout="rows">
                    <KeyValue label="Inputs">
                        {count === null ? null : formatCount(count)}
                    </KeyValue>
                    <KeyValue label="Dimensions" missing="Model default">
                        {dimensions === null ? null : formatCount(dimensions)}
                    </KeyValue>
                </KeyValueList>
                <p className="text-ui text-muted-foreground">
                    The embedded texts are not stored.
                </p>
            </div>
            <EmbeddingUsage span={span} />
        </div>
    )
}
