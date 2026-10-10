import type { To } from 'react-router'
import type { AgentModel, DelegatedModel } from '@/api/types'
import { RankedListItem } from '@/components/patterns/ranked-list-item'
import { CostValue } from '@/components/telemetry/cost-value'
import { ModelLabel } from '@/components/telemetry/model-label'
import { TokenValue } from '@/components/telemetry/token-value'
import { callsText, runsText } from '@/features/agents/breakdown-words'

type ModelRowProps = {
    model: AgentModel | DelegatedModel
    /** The runs list over exactly the runs the row counted. Left out for a row that cannot be one. */
    to?: To
    /** The row should have led to its runs and could not: it says so instead of looking like one that never does. */
    unlinkable?: boolean
    /** Its part of the agent's own runs; `null` draws no bar. */
    share: number | null
}

/**
 * One model of an agent's runs: the model and its provider, in how many runs it was used, how
 * many calls were made to it and what they cost and used. A model that only an agent span asked
 * for has no call, and so no cost or tokens to say.
 */
export function ModelRow({ model, to, unlinkable, share }: ModelRowProps) {
    const { usage } = model

    return (
        <RankedListItem
            label={
                <ModelLabel
                    of={{ provider: model.provider, model: model.model }}
                />
            }
            value={runsText(model.runs)}
            share={share}
            to={to}
            detail={
                model.steps === 0 ? (
                    <>
                        asked for, not called
                        {unlinkable ? <Unlinkable /> : null}
                    </>
                ) : (
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span>{callsText(model.steps)}</span>
                        <CostValue cost={model.cost} pendingAmount="show" />
                        <span>
                            Tokens <TokenValue usage={usage} />
                        </span>
                        {unlinkable ? <Unlinkable /> : null}
                    </span>
                )
            }
        />
    )
}

function Unlinkable() {
    return <span> · Its runs could not be linked.</span>
}
