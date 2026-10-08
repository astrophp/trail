import type { Span } from '@/api/types'
import { KeyValue } from '@/components/patterns/key-value'
import { KeyValueList } from '@/components/patterns/key-value-list'
import { EmbeddingUsage } from '@/features/trace/embedding-usage'
import {
    embeddingInput,
    embeddingOutput,
} from '@/components/telemetry/payload-shape'
import { WholeOutput } from '@/features/trace/whole-output'
import { formatCount } from '@/lib/format'

type EmbeddingOutputProps = { span: Span }

/** How many embeddings came back. The vectors are never stored. The call's usage is here when the input tab, which holds it, does not show the call. */
export function EmbeddingOutput({ span }: EmbeddingOutputProps) {
    const shape = embeddingOutput(span.output)

    if (shape.kind === 'none') {
        return null
    }

    if (shape.kind === 'whole') {
        return <WholeOutput span={span} />
    }

    return (
        <div className="flex flex-col gap-6">
            <KeyValueList layout="rows">
                <KeyValue label="Embeddings">
                    {shape.value.count === null
                        ? null
                        : formatCount(shape.value.count)}
                </KeyValue>
            </KeyValueList>
            {embeddingInput(span.input).kind !== 'typed' ? (
                <EmbeddingUsage span={span} />
            ) : null}
        </div>
    )
}
