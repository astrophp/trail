import type { To } from 'react-router'
import type { UsageModelRow } from '@/api/types'
import { RankedListItem } from '@/components/patterns/ranked-list-item'
import { CostValue } from '@/components/telemetry/cost-value'
import { ModelLabel } from '@/components/telemetry/model-label'
import { formatCount } from '@/lib/format'

type RankedModelRowProps = {
    model: UsageModelRow
    /** What the row is ranked by, and so what it shows: its runs, or its estimated cost. */
    figure: 'runs' | 'cost'
    /** The runs list over exactly the runs the row counted. Left out for a row that cannot be one. */
    to?: To
    /** The row should have led to its runs and could not: it says so instead of looking like one that never does. */
    unlinkable?: boolean
}

const runsText = (count: number) =>
    `${formatCount(count)} ${count === 1 ? 'run' : 'runs'}`

/** One model of the range: its provider and name, and the figure the list is ranked by. */
export function RankedModelRow({
    model,
    figure,
    to,
    unlinkable = false,
}: RankedModelRowProps) {
    const detail =
        figure === 'cost' || unlinkable ? (
            <>
                {figure === 'cost' ? runsText(model.runs) : null}
                {figure === 'cost' && unlinkable ? ' · ' : null}
                {unlinkable ? 'Its runs could not be linked.' : null}
            </>
        ) : undefined

    return (
        <RankedListItem
            label={
                <ModelLabel
                    of={{ provider: model.provider, model: model.model }}
                />
            }
            value={
                figure === 'cost' ? (
                    <CostValue cost={model.cost} pendingAmount="show" />
                ) : (
                    runsText(model.runs)
                )
            }
            // A run can use several models, so the rows are not parts of one whole: no bar is drawn.
            share={null}
            to={to}
            detail={detail}
        />
    )
}
