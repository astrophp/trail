import type { AgentSubtotal } from '@/api/types'
import { CostValue } from '@/components/telemetry/cost-value'
import { TableCell, TableHead, TableRow } from '@/components/ui/table'
import { UsageCounts } from '@/features/trace/usage-counts'

/** An agent's own usage, without the agents it delegated to, as the server counted it. */
export function UsageSubtotalRow({ agent }: { agent: AgentSubtotal }) {
    return (
        <TableRow className="bg-muted/50 font-medium">
            <TableHead
                scope="row"
                colSpan={2}
                className="h-auto p-2 font-medium"
            >
                {agent.name}
                <span className="ms-2 text-caption font-normal text-muted-foreground">
                    own, without delegated agents
                </span>
            </TableHead>
            <UsageCounts usage={agent.usage} />
            <TableCell className="text-end">
                <CostValue cost={agent.cost} className="items-end" />
            </TableCell>
        </TableRow>
    )
}
