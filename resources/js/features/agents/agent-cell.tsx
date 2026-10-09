import type { Agent } from '@/api/types'
import { RowLink } from '@/components/patterns/row-link'
import { AgentIcon } from '@/components/telemetry/agent-icon'

/**
 * Who the agent is: its icon and name, the name being the row's link to the agent's page (`to`),
 * and under it what else identifies it: the class when it has one, and the word Embeddings for
 * a run of embeddings. Both lines are cut to the cell, with the whole text on hover.
 */
export function AgentCell({ agent, to }: { agent: Agent; to: string }) {
    const embedding = agent.type === 'embedding'

    return (
        <div className="flex max-w-24 min-w-0 flex-col gap-1 leading-normal xs:max-w-45 md:max-w-50">
            <div className="flex min-w-0 items-center gap-2">
                <AgentIcon type={agent.type} />
                <RowLink to={to} title={agent.name} className="truncate">
                    {agent.name}
                </RowLink>
            </div>
            {embedding || agent.agent_class !== null ? (
                // Aligned under the name: the icon is 15 pixels and the gap 8.
                <p className="flex min-w-0 gap-1.5 pl-5.75 text-caption text-muted-foreground">
                    {embedding ? (
                        <span className="shrink-0">Embeddings</span>
                    ) : null}
                    {agent.agent_class === null ? null : (
                        <span
                            title={agent.agent_class}
                            className="min-w-0 truncate font-mono"
                        >
                            {agent.agent_class}
                        </span>
                    )}
                </p>
            ) : null}
        </div>
    )
}
