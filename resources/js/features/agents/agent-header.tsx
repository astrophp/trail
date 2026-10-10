import { Link, type To } from 'react-router'
import type { Agent } from '@/api/types'
import { PageHeader } from '@/components/patterns/page-header'
import { TimeRangeSelect } from '@/components/patterns/time-range-select'
import { AgentIcon } from '@/components/telemetry/agent-icon'
import { Button } from '@/components/ui/button'
import { agentRole, agentTitle } from '@/features/agents/agent-words'
import type { TimeRangePreset } from '@/lib/time-range'
import { cn } from '@/lib/utils'

type AgentHeaderProps = {
    /** The name to call the page: the agent's own spelling once it is known, else the address's. */
    name: string
    /** The agent for the range; `undefined` while it is not known. */
    agent?: Agent
    range: TimeRangePreset
    onRangeChange: (range: TimeRangePreset) => void
    /** The traces list over the agent's runs and the range of the data shown. Only an agent with runs of its own has one. */
    allTraces?: To
    /** The agent is the previous range's answer: how it runs is dimmed with the figures, as it is theirs. */
    placeholder?: boolean
}

/**
 * The agent's name as the page's heading, beside its icon, with under it the class that implements
 * it and, in words, how it runs: on its own, as a sub-agent, both, or as embeddings. The range
 * picker and the way to all its runs are the page's actions.
 */
export function AgentHeader({
    name,
    agent,
    range,
    onRangeChange,
    allTraces,
    placeholder = false,
}: AgentHeaderProps) {
    const role = agent === undefined ? null : agentRole(agent)
    const agentClass = agent?.agent_class ?? null

    return (
        <PageHeader
            title={agentTitle(name)}
            icon={<AgentIcon type={agent?.type ?? 'agent'} />}
            description={
                agentClass === null && role === null ? undefined : (
                    <>
                        {agentClass === null ? null : (
                            <span className="font-mono text-xs wrap-anywhere">
                                {agentClass}
                            </span>
                        )}
                        {agentClass !== null && role !== null ? ' · ' : null}
                        {role === null ? null : (
                            <span
                                data-slot="agent-role"
                                aria-busy={placeholder || undefined}
                                className={cn(
                                    'motion-safe:transition-opacity',
                                    placeholder && 'opacity-60',
                                )}
                            >
                                {role}
                            </span>
                        )}
                    </>
                )
            }
        >
            <TimeRangeSelect value={range} onValueChange={onRangeChange} />
            {allTraces === undefined ? null : (
                <Button asChild variant="outline" size="sm">
                    <Link to={allTraces}>View all traces</Link>
                </Button>
            )}
        </PageHeader>
    )
}
