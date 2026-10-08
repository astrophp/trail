import type { Span } from '@/api/types'
import { CostValue } from '@/components/telemetry/cost-value'
import { TokenBreakdown } from '@/components/telemetry/token-breakdown'
import { SectionLabel } from '@/features/trace/section-label'

type EmbeddingUsageProps = { span: Span }

/** What an embeddings call used and cost, under the tab that describes the call. Nothing when it did not bill. */
export function EmbeddingUsage({ span }: EmbeddingUsageProps) {
    if (span.usage === null || span.cost === null) {
        return null
    }

    return (
        <section data-slot="embedding-usage" className="flex flex-col gap-3">
            <SectionLabel>Usage</SectionLabel>
            <TokenBreakdown usage={span.usage} className="max-w-sm" />
            <p className="text-ui">
                <span className="text-muted-foreground">Cost </span>
                <CostValue cost={span.cost} className="inline" />
            </p>
        </section>
    )
}
