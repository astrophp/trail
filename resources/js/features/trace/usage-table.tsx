import { Fragment } from 'react'
import type { AgentSubtotal, UsageRow } from '@/api/types'
import {
    Table,
    TableBody,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { groupUsageRows } from '@/features/trace/group-usage-rows'
import { UsageSubtotalRow } from '@/features/trace/usage-subtotal-row'
import { UsageTableRow } from '@/features/trace/usage-table-row'

type UsageTableProps = {
    rows: UsageRow[]
    agents: AgentSubtotal[]
    attempts: number
    truncated: boolean
    onOpenSpan: (id: string) => void
}

const numeric = 'text-end'

/** One row per step and embedding, in the API's order; grouped by agent, with its subtotal, when the run delegated. */
export function UsageTable({
    rows,
    agents,
    attempts,
    truncated,
    onOpenSpan,
}: UsageTableProps) {
    const groups = groupUsageRows(rows, agents)
    const names = new Map(agents.map((agent) => [agent.span_id, agent.name]))

    return (
        <Table className="text-ui" aria-label="Steps and embeddings">
            <TableHeader>
                <TableRow>
                    <TableHead scope="col">Span</TableHead>
                    <TableHead scope="col">Model</TableHead>
                    <TableHead scope="col" className={numeric}>
                        Input
                    </TableHead>
                    <TableHead scope="col" className={numeric}>
                        Output
                    </TableHead>
                    <TableHead scope="col" className={numeric}>
                        Cache read
                    </TableHead>
                    <TableHead scope="col" className={numeric}>
                        Cache write
                    </TableHead>
                    <TableHead scope="col" className={numeric}>
                        Reasoning
                    </TableHead>
                    <TableHead scope="col" className={numeric}>
                        Cost
                    </TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {groups.map((group, position) => (
                    <Fragment key={`${position}:${group.key}`}>
                        {group.orphan ? (
                            <TableRow className="bg-muted/50">
                                <TableHead
                                    scope="rowgroup"
                                    colSpan={8}
                                    className="h-auto p-2"
                                >
                                    Not under an agent
                                </TableHead>
                            </TableRow>
                        ) : null}
                        {group.rows.map((row, index) => (
                            <UsageTableRow
                                key={`${row.span_id}:${index}`}
                                row={row}
                                agentName={
                                    row.agent_span_id === null
                                        ? undefined
                                        : names.get(row.agent_span_id)
                                }
                                attempts={attempts}
                                truncated={truncated}
                                onOpenSpan={onOpenSpan}
                            />
                        ))}
                        {group.agent ? (
                            <UsageSubtotalRow agent={group.agent} />
                        ) : null}
                    </Fragment>
                ))}
            </TableBody>
        </Table>
    )
}
