import { useLocation } from 'react-router'
import { AgentView, agentPageParams } from '@/features/agents'
import { RecentTraces } from '@/features/traces'
import { useUrlState } from '@/hooks/use-url-state'
import { returnTo } from '@/lib/return-context'

/** How many of the agent's latest runs the page lists. */
const recentLimit = 8

/**
 * One agent, as the address names it: its name (any text, read as the address spells it), the time
 * range and the mode of the activity chart are the address's. The agent's recent runs belong to
 * the traces feature, so the page is where they are placed beside the agent's own parts; a run
 * opened from them leads back to this page, with its range and chart mode.
 */
export function AgentPage() {
    const [{ name, chart }, setParams] = useUrlState(agentPageParams)
    const { pathname, search } = useLocation()

    return (
        <AgentView
            name={name}
            mode={chart}
            onModeChange={(next) => setParams({ chart: next })}
            recent={({ agent, range, leader }) => (
                <RecentTraces
                    agent={agent}
                    range={range}
                    limit={recentLimit}
                    returnTarget={returnTo(pathname, search)}
                    leader={leader}
                />
            )}
        />
    )
}
