import { useMemo } from 'react'
import { BreakdownPanel } from '@/features/agents/breakdown-panel'
import { linkRows, unlinkable } from '@/features/agents/breakdown-links'
import {
    useUnlinkedReport,
    type BreakdownState,
} from '@/features/agents/breakdown-state'
import { shareOf } from '@/features/agents/breakdown-words'
import { ModelRow } from '@/features/agents/model-row'

const none = { limit: 0, total: 0 }

/**
 * The models an agent's runs used, most runs first, each linking to those runs. Under them, the
 * models used inside the runs it was delegated to, which cannot be linked.
 */
export function ModelsPanel({
    state,
    className,
}: {
    state: BreakdownState
    className?: string
}) {
    const { answer, shown, total } = state
    const linked = useMemo(
        () => (answer === undefined ? [] : linkRows(answer.data.models, shown)),
        [answer, shown],
    )

    useUnlinkedReport('model', unlinkable(linked))

    return (
        <BreakdownPanel
            title="Models"
            noun="model"
            emptyTitle="No model was called in this range"
            busyLabel="Loading the models"
            loading={state.loading}
            busy={state.busy}
            failure={state.failure}
            own={
                state.hasOwnRuns
                    ? {
                          rows: linked.map(({ row, to }) => (
                              <ModelRow
                                  key={`${row.provider}\n${row.model}`}
                                  model={row}
                                  to={to ?? undefined}
                                  unlinkable={to === null}
                                  share={shareOf(row.runs, total)}
                              />
                          )),
                          limit: answer?.limits.models ?? none,
                      }
                    : undefined
            }
            delegated={{
                rows: (answer?.data.delegated.models ?? []).map((model) => (
                    <ModelRow
                        key={`${model.provider}\n${model.model}`}
                        model={model}
                        share={null}
                    />
                )),
                limit: answer?.limits.delegated.models ?? none,
            }}
            className={className}
        />
    )
}
