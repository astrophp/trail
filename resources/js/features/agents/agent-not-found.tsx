import { SearchXIcon } from 'lucide-react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/patterns/empty-state'
import { Button } from '@/components/ui/button'
import { useReturnTarget } from '@/hooks/use-return-target'

/**
 * An agent that was never recorded, or an address that names none, with the way back to the list
 * of agents (the view of it the person came from, when there is one). The name is said as the
 * address spells it, since no spelling of it was ever recorded.
 */
export function AgentNotFound({ name }: { name: string }) {
    const back = useReturnTarget()
    const list =
        back?.pathname === '/agents'
            ? `${back.pathname}${back.search}`
            : '/agents'

    return (
        <EmptyState
            icon={SearchXIcon}
            title={
                name === '' ? 'No agent was named' : 'This agent was not found'
            }
            description={
                name === '' ? (
                    'This address does not say which agent to show. Pick one from the list of agents.'
                ) : (
                    <>
                        No run or sub-agent run was recorded under the name{' '}
                        <span className="font-mono text-xs wrap-anywhere whitespace-pre-wrap">
                            “{name}”
                        </span>
                        . It may have been pruned, or it was never recorded.
                    </>
                )
            }
        >
            <Button asChild variant="outline" size="sm">
                <Link to={list}>Back to Agents</Link>
            </Button>
        </EmptyState>
    )
}
