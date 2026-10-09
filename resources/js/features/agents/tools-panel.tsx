import { useMemo } from 'react'
import { BreakdownPanel } from '@/features/agents/breakdown-panel'
import { linkRows, unlinkable } from '@/features/agents/breakdown-links'
import {
    useUnlinkedReport,
    type BreakdownState,
} from '@/features/agents/breakdown-state'
import { shareOf } from '@/features/agents/breakdown-words'
import { ToolRow } from '@/features/agents/tool-row'

const none = { limit: 0, total: 0 }

/**
 * The tools an agent's runs called, most runs first, each linking to those runs. Under them, the
 * tools called inside the runs it was delegated to, which cannot be linked.
 */
export function ToolsPanel({
    state,
    className,
}: {
    state: BreakdownState
    className?: string
}) {
    const { answer, shown, total } = state
    const linked = useMemo(
        () => (answer === undefined ? [] : linkRows(answer.data.tools, shown)),
        [answer, shown],
    )

    useUnlinkedReport('tool', unlinkable(linked))

    return (
        <BreakdownPanel
            title="Tools"
            noun="tool"
            emptyTitle="No tool was called in this range"
            busyLabel="Loading the tools"
            loading={state.loading}
            busy={state.busy}
            failure={state.failure}
            own={
                state.hasOwnRuns
                    ? {
                          rows: linked.map(({ row, to }) => (
                              <ToolRow
                                  key={row.name}
                                  tool={row}
                                  to={to ?? undefined}
                                  unlinkable={to === null}
                                  share={shareOf(row.runs, total)}
                              />
                          )),
                          limit: answer?.limits.tools ?? none,
                      }
                    : undefined
            }
            delegated={{
                rows: (answer?.data.delegated.tools ?? []).map((tool) => (
                    <ToolRow key={tool.name} tool={tool} share={null} />
                )),
                limit: answer?.limits.delegated.tools ?? none,
            }}
            className={className}
        />
    )
}
