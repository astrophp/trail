import type { Agent } from '@/api/types'

/**
 * What to call an agent. A name can be empty or only white space, which a heading or a link could
 * not be called after; it is still looked up by the name exactly as the API gave it.
 */
export const agentTitle = (name: string): string =>
    name.trim() === '' ? 'Unnamed agent' : name

/**
 * In words, what the agent is in the range: whether it runs on its own, as a sub-agent, or both.
 * `null` when it did nothing in the range, so nothing is known about how it runs.
 */
export function agentRole(agent: Agent): string | null {
    if (agent.type === 'embedding') {
        return 'Embeddings'
    }

    const own = agent.top_level !== null
    const delegated = agent.delegated !== null

    if (own && delegated) {
        return 'Runs on its own and as a sub-agent'
    }

    if (own) {
        return 'Runs on its own'
    }

    return delegated ? 'Runs only as a sub-agent' : null
}
