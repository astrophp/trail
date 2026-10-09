import { useMemo, type ReactNode } from 'react'
import { isNotFound } from '@/api/client'
import { tracesLink, tracesLinkers } from '@/api/traces-link'
import { ErrorState } from '@/components/patterns/error-state'
import { RefreshNote } from '@/components/patterns/refresh-note'
import type { ActivityMode } from '@/components/telemetry/activity-mode'
import { AgentHeader } from '@/features/agents/agent-header'
import { AgentLoaded } from '@/features/agents/agent-loaded'
import { AgentNotFound } from '@/features/agents/agent-not-found'
import { AgentSkeleton } from '@/features/agents/agent-skeleton'
import { agentTitle } from '@/features/agents/agent-words'
import { agentViewKey, useAgent } from '@/features/agents/use-agent'
import { useFocusHandoff } from '@/hooks/use-focus-handoff'
import { usePageTitle } from '@/hooks/use-page-title'
import { useQueryStatus } from '@/hooks/use-query-status'
import { useTimeRange } from '@/hooks/use-time-range'
import type { Refreshing } from '@/lib/refresh-policy'
import type { TimeRangePreset } from '@/lib/time-range'

/** What a page that places something beside the agent's figures is told about the agent and its range. */
export type AgentSlot = {
    /** The agent's name as its runs spell it, which a link to its runs uses. */
    agent: string
    /** The range of the data shown, which whatever is placed follows. */
    range: TimeRangePreset
    /** The agent's own query: whatever is placed keeps up with it while a run is running. */
    leader: {
        dataUpdatedAt: number
        isPlaceholderData: boolean
        refreshing: Refreshing
    }
}

type AgentViewProps = {
    /** The agent's name as the address spells it; empty when it names none. */
    name: string
    mode: ActivityMode
    onModeChange: (mode: ActivityMode) => void
    /** What the page places under the models and tools: the agent's recent traces. Only an agent with runs of its own has them. */
    recent?: (slot: AgentSlot) => ReactNode
    className?: string
}

/**
 * One agent in depth, as a way into its runs: how it ran, what it cost, what needs a look, which
 * models and tools it used. It loads the agent itself and says so when it is loading, could not be
 * loaded, was never recorded, or did nothing in the range. An agent keeps nothing of the one
 * before it: not its figures and not its failure.
 */
export function AgentView({ name, ...props }: AgentViewProps) {
    return <Agent key={name} name={name} {...props} />
}

function Agent({
    name,
    mode,
    onModeChange,
    recent,
    className,
}: AgentViewProps) {
    const [range, setRange] = useTimeRange()
    const query = useAgent(name, range)
    const { data, isError, isPlaceholderData } = query
    const status = useQueryStatus(query, agentViewKey(name, range))
    const missing = name === '' || (status.failed && isNotFound(status.failure))
    // The range the figures are for: the previous one while the next loads.
    const shown = data?.range.preset ?? range
    const answer = status.loading || status.failed ? undefined : data?.data
    const agent = answer?.agent
    // The one set of links the page's figures use: all of them narrow to this agent's runs.
    const linkers = useMemo(
        () => tracesLinkers(agent === undefined ? {} : { agent: agent.name }),
        [agent],
    )

    // The breadcrumb and the tab are called after the agent while it is there to show.
    usePageTitle(name === '' ? null : agentTitle(agent?.name ?? name))
    // The retry button, or the one of the stopped notice, goes away when the page loads.
    useFocusHandoff(status.failed || query.refreshing === 'stopped')

    // An empty placeholder is the previous range's "nothing ran": it says nothing about this one.
    const stale =
        isPlaceholderData &&
        answer !== undefined &&
        answer.agent.top_level === null &&
        answer.agent.delegated === null

    const leader = {
        dataUpdatedAt: query.dataUpdatedAt,
        isPlaceholderData,
        refreshing: query.refreshing,
    }

    const body = () => {
        if (missing) {
            return <AgentNotFound name={name} />
        }

        if (status.failed) {
            return (
                <ErrorState
                    title="The agent could not be loaded"
                    error={status.failure}
                    retrying={status.retrying}
                    onRetry={() => void query.refetch()}
                />
            )
        }

        if (answer === undefined || stale) {
            return <AgentSkeleton />
        }

        return (
            <>
                <RefreshNote
                    refreshing={query.refreshing}
                    failed={isError}
                    onRetry={() => void query.refreshAgain()}
                />
                <AgentLoaded
                    name={name}
                    answer={answer}
                    range={shown}
                    selected={range}
                    placeholder={isPlaceholderData}
                    link={linkers.link}
                    mode={mode}
                    onModeChange={onModeChange}
                    recent={recent?.({
                        agent: answer.agent.name,
                        range: shown,
                        leader,
                    })}
                    leader={leader}
                    refreshNoted={isError}
                />
            </>
        )
    }

    return (
        <div data-slot="agent-view" className={className}>
            <AgentHeader
                name={agent?.name ?? name}
                agent={agent}
                range={range}
                onRangeChange={setRange}
                placeholder={isPlaceholderData}
                allTraces={
                    agent === undefined || agent.top_level === null
                        ? undefined
                        : tracesLink(shown, { agent: agent.name })
                }
            />
            <div className="mt-5.75 lg:mt-6.5">{body()}</div>
        </div>
    )
}
