import type { Span } from '@/api/types'
import { KeyValue } from '@/components/patterns/key-value'
import { KeyValueList } from '@/components/patterns/key-value-list'
import { CostValue } from '@/components/telemetry/cost-value'
import { TokenBreakdown } from '@/components/telemetry/token-breakdown'
import { SectionLabel } from '@/components/telemetry/section-label'

type EmbeddingUsageProps = { span: Span }

/** What an embeddings call used and cost, under the tab that describes the call. Nothing when it did not bill. */
export function EmbeddingUsage({ span }: EmbeddingUsageProps) {
    if (span.usage === null || span.cost === null) {
        return null
    }

    return (
        <section data-slot="embedding-usage" className="flex flex-col gap-3">
            <SectionLabel>Usage</SectionLabel>
            <KeyValueList layout="rows">
                <TokenBreakdown usage={span.usage} layout="rows" />
                <KeyValue label="Cost">
                    <CostValue cost={span.cost} />
                </KeyValue>
            </KeyValueList>
        </section>
    )
}
