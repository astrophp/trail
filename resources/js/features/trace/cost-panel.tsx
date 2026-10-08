import type { Cost, SpanLimit, UsageRow } from '@/api/types'
import { CostValue } from '@/components/telemetry/cost-value'
import {
    costExplanations,
    unpricedSentence,
} from '@/features/trace/cost-explanation'
import { RunPanel } from '@/features/trace/run-panel'
import { unpricedModels } from '@/features/trace/unpriced-models'

type CostPanelProps = {
    cost: Cost
    rows: UsageRow[]
    spanLimit: SpanLimit
}

/** The run's cost as the server priced it, and in words what it covers; a gap names the models that need a price. */
export function CostPanel({ cost, rows, spanLimit }: CostPanelProps) {
    const models = unpricedSentence(cost.state, unpricedModels(rows), spanLimit)

    return (
        <RunPanel title="Estimated cost">
            <CostValue cost={cost} className="text-title" />
            <p className="text-ui text-muted-foreground">
                {costExplanations[cost.state]}
            </p>
            {models === null ? null : <p className="text-ui">{models}</p>}
        </RunPanel>
    )
}
