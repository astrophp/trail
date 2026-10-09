import type { Leader } from '@/lib/refresh-policy'
import { failureMessage } from '@/api/client'
import { RefreshNote } from '@/components/patterns/refresh-note'
import { ModelsPanel } from '@/features/agents/models-panel'
import { ToolsPanel } from '@/features/agents/tools-panel'
import { agentViewKey } from '@/features/agents/use-agent'
import { useAgentBreakdown } from '@/features/agents/use-agent-breakdown'
import { useFocusHandoff } from '@/hooks/use-focus-handoff'
import { useQueryStatus } from '@/hooks/use-query-status'
import type {} from '@/lib/refresh-policy'
import type { TimeRangePreset } from '@/lib/time-range'

type AgentBreakdownProps = {
    /** The agent as the address names it, which the request is made with. */
    name: string
    range: TimeRangePreset
    /**
     * The agent's own runs and the range they were counted over: what a row's part is a part of.
     * `null` for an agent with no runs of its own, whose rows are all inside runs it was delegated to.
     */
    ownRuns: { runs: number; range: TimeRangePreset } | null
    /** The page's one query for the agent, which the breakdown follows once it settles. */
    leader: Leader
    /** The page already says that its last refresh failed, so this says it no more. */
    refreshNoted?: boolean
    className?: string
}

/**
 * The models and the tools of an agent, each a ranked list in a panel of its own, side by side
 * when there is room and stacked when there is not. It is one request, slow at large volume by
 * nature, that the rest of the page does not wait for; each panel has its own loading, failed,
 * empty and previous-range states.
 */
export function AgentBreakdown({
    name,
    range,
    ownRuns,
    leader,
    refreshNoted = false,
    className,
}: AgentBreakdownProps) {
    const breakdown = useAgentBreakdown(name, range, leader)
    const { data, isPlaceholderData } = breakdown
    const { failed, retrying, failure, loading } = useQueryStatus(
        breakdown,
        agentViewKey(name, range),
    )

    // The retry button, or the one of the refresh note, goes away when the rows load.
    useFocusHandoff(failed || (breakdown.isError && !refreshNoted))

    // The range the rows were counted over: the previous one while the next loads.
    const shown = data?.range.preset ?? range
    const state = {
        answer: loading || failed ? undefined : data,
        shown,
        loading,
        busy: isPlaceholderData,
        waiting: breakdown.waitingForLeader,
        failure: failed
            ? {
                  message: failureMessage(failure),
                  onRetry: () => {
                      if (!retrying) {
                          void breakdown.refetch()
                      }
                  },
              }
            : undefined,
        // A part of the runs is only a part when both were counted over the same range.
        total:
            ownRuns !== null && ownRuns.range === shown ? ownRuns.runs : null,
        hasOwnRuns: ownRuns !== null,
    }

    return (
        <div data-slot="agent-breakdown" className={className}>
            {loading || failed || refreshNoted ? null : (
                <RefreshNote
                    refreshing={breakdown.refreshing}
                    failed={breakdown.isError}
                    onRetry={() => void breakdown.refreshAgain()}
                />
            )}
            <div className="@container">
                <div className="grid items-start gap-4 @4xl:grid-cols-2">
                    <ModelsPanel state={state} />
                    <ToolsPanel state={state} />
                </div>
            </div>
        </div>
    )
}
