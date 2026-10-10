import type { Cost, SpanLimit, Usage, UsageRow } from '@/api/types'
import { KeyValue } from '@/components/patterns/key-value'
import { KeyValueList } from '@/components/patterns/key-value-list'
import { CostValue } from '@/components/telemetry/cost-value'
import { TokenBreakdown } from '@/components/telemetry/token-breakdown'
import {
    costExplanations,
    unpricedSentence,
} from '@/features/trace/cost-explanation'
import { RunPanel } from '@/features/trace/run-panel'
import { unpricedModels } from '@/features/trace/unpriced-models'

type TokenTotalsProps = {
    usage: Usage
    cost: Cost
    rows: UsageRow[]
    spanLimit: SpanLimit
    className?: string
}

/**
 * The run's tokens as the server counted them (cache and reasoning are parts of input and output,
 * not added on top), then its cost as the server priced it, and in words what the cost covers; a
 * gap names the models that need a price.
 */
export function TokenTotals({
    usage,
    cost,
    rows,
    spanLimit,
    className,
}: TokenTotalsProps) {
    const models = unpricedSentence(cost.state, unpricedModels(rows), spanLimit)

    return (
        <RunPanel title="Tokens and cost" className={className}>
            <KeyValueList layout="rows">
                <TokenBreakdown usage={usage} layout="rows" />
                <KeyValue label="Estimated cost">
                    <CostValue cost={cost} />
                </KeyValue>
            </KeyValueList>
            <p className="text-caption text-muted-foreground">
                {costExplanations[cost.state]}
            </p>
            {models === null ? null : (
                <p className="text-caption text-muted-foreground">{models}</p>
            )}
        </RunPanel>
    )
}
