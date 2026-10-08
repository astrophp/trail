import type { Conversation } from '@/api/types'
import {
    skeletonBarClass,
    type DataTableColumn,
} from '@/components/patterns/data-table'
import { CostValue } from '@/components/telemetry/cost-value'
import { Timestamp } from '@/components/telemetry/timestamp'
import { TokenValue } from '@/components/telemetry/token-value'
import { Skeleton } from '@/components/ui/skeleton'
import { ConversationCell } from '@/features/conversations/conversation-cell'
import { FailuresCell } from '@/features/conversations/failures-cell'
import { TurnsCell } from '@/features/conversations/turns-cell'
import { UserCell } from '@/features/conversations/user-cell'
import { cn } from '@/lib/utils'

// The id of a sortable column is the API's name for the field it sorts by (see `toApiSort` in lib/table-sort.ts).
// A column needs an accessor to be sortable at all; the server sorts, so the values are never read.
export const conversationColumns: DataTableColumn<Conversation>[] = [
    {
        id: 'conversation',
        header: 'Conversation',
        meta: {
            rowHeader: true,
            // The cell is two lines: the latest prompt, then the id and the agents.
            skeleton: (
                <div className="flex w-51.5 flex-col gap-2 py-1.5 md:w-71.5">
                    <Skeleton className={cn(skeletonBarClass, 'h-3.5 w-3/4')} />
                    <Skeleton className={cn(skeletonBarClass, 'h-3 w-1/2')} />
                </div>
            ),
        },
        cell: ({ row }) => <ConversationCell conversation={row.original} />,
    },
    {
        id: 'user',
        header: 'User',
        meta: {
            skeleton: (
                <div className="flex w-32 flex-col gap-2 py-1.5">
                    <Skeleton className={cn(skeletonBarClass, 'h-3.5 w-3/4')} />
                    <Skeleton className={cn(skeletonBarClass, 'h-3 w-full')} />
                </div>
            ),
        },
        cell: ({ row }) => <UserCell conversation={row.original} />,
    },
    {
        id: 'turns',
        accessorFn: (conversation) => conversation.turns.all,
        header: 'Turns',
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'end' },
        cell: ({ row }) => <TurnsCell conversation={row.original} />,
    },
    {
        id: 'failures',
        header: 'Failures',
        meta: { align: 'end' },
        cell: ({ row }) => <FailuresCell conversation={row.original} />,
    },
    {
        id: 'tokens',
        header: 'Tokens',
        meta: { align: 'end' },
        cell: ({ row }) => <TokenValue usage={row.original.usage} />,
    },
    {
        id: 'cost',
        accessorFn: (conversation) => conversation.cost.amount,
        header: 'Est. cost',
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'end' },
        cell: ({ row }) => <CostValue cost={row.original.cost} />,
    },
    {
        id: 'last_activity',
        accessorFn: (conversation) => conversation.last_activity_at,
        header: 'Last activity',
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'end' },
        cell: ({ row }) => <Timestamp at={row.original.last_activity_at} />,
    },
]
