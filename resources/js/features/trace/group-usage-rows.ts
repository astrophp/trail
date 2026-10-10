import type { AgentSubtotal, UsageRow } from '@/api/types'

export type UsageGroup = {
    key: string
    /** The agent's own subtotal; `null` for the rows under no agent, and for a run with a single group. */
    agent: AgentSubtotal | null
    /** The group is the rows no agent owns. */
    orphan: boolean
    rows: UsageRow[]
}

/**
 * The rows of the usage table, grouped by agent when the run had more than one: in the order of
 * `agents`, each with its subtotal, then the rows under no agent. An agent without rows has no
 * group. A run with one agent or none is one group without a subtotal; its totals are the
 * panel's above.
 */
export function groupUsageRows(
    rows: UsageRow[],
    agents: AgentSubtotal[],
): UsageGroup[] {
    if (agents.length <= 1) {
        return rows.length === 0
            ? []
            : [{ key: 'group:all', agent: null, orphan: false, rows }]
    }

    const known = new Set(agents.map((agent) => agent.span_id))
    const groups: UsageGroup[] = agents
        .map((agent) => ({
            key: `agent:${agent.span_id}`,
            agent,
            orphan: false,
            rows: rows.filter((row) => row.agent_span_id === agent.span_id),
        }))
        .filter((group) => group.rows.length > 0)
    const orphans = rows.filter(
        (row) => row.agent_span_id === null || !known.has(row.agent_span_id),
    )

    return orphans.length === 0
        ? groups
        : [
              ...groups,
              { key: 'group:none', agent: null, orphan: true, rows: orphans },
          ]
}
