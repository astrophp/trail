import type { Agent } from '@/api/types'
import { RowLink } from '@/components/patterns/row-link'
import { AgentIcon } from '@/components/telemetry/agent-icon'
import { useTruncated } from '@/features/agents/use-truncated'
import { cn } from '@/lib/utils'

/**
 * Who the agent is: its icon and name, the name being the row's link to the agent's page (`to`),
 * and under it what else identifies it: the class when it has one, and the word Embeddings for
 * a run of embeddings. Both lines are cut to the room the column has; the whole text is on hover
 * only when it is cut (otherwise it would be read twice).
 *
 * A name that is empty or only white space is shown as "Unnamed agent" so the link has a name;
 * it still leads to the agent by the name exactly as the API gave it.
 */
export function AgentCell({ agent, to }: { agent: Agent; to: string }) {
    const embedding = agent.type === 'embedding'
    const unnamed = agent.name.trim() === ''
    const [nameRef, nameCut] = useTruncated(agent.name)
    const [classRef, classCut] = useTruncated(agent.agent_class ?? '')

    return (
        <div className="flex min-w-0 flex-col gap-1 leading-normal">
            <div className="flex min-w-0 items-center gap-2">
                <AgentIcon type={agent.type} />
                <RowLink
                    ref={nameRef}
                    to={to}
                    title={nameCut ? agent.name : undefined}
                    className={cn(
                        'truncate',
                        unnamed && 'font-normal text-muted-foreground',
                    )}
                >
                    {unnamed ? 'Unnamed agent' : agent.name}
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
                            ref={classRef}
                            title={classCut ? agent.agent_class : undefined}
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
