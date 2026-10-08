import { useRef } from 'react'
import { CountTabs, type CountTab } from '@/components/patterns/count-tabs'
import { ConversationFilterChips } from '@/features/conversations/conversation-filter-chips'
import { ConversationFilters } from '@/features/conversations/conversation-filters'
import { ConversationsTable } from '@/features/conversations/conversations-table'
import { useConversationList } from '@/features/conversations/use-conversation-list'
import { useConversations } from '@/features/conversations/use-conversations'

type ConversationsViewProps = {
    /** The agents seen in the range, for the filter; `undefined` while unknown. */
    agents: string[] | undefined
    className?: string
}

/**
 * The conversations with the ways to narrow them: the two tabs (all, and those with failures) with
 * the API's counts, the filter row, the chips of the filters that are on, and the table.
 */
export function ConversationsView({
    agents,
    className,
}: ConversationsViewProps) {
    const list = useConversationList()
    // The counts of the response the table is showing (the previous one while a refresh runs).
    const { data } = useConversations(list.view)
    const searchRef = useRef<HTMLInputElement>(null)
    const tabs: CountTab[] = [
        { value: 'all', label: 'All conversations', count: data?.counts.all },
        {
            value: 'failed',
            label: 'With failures',
            count: data?.counts.failed,
        },
    ]

    return (
        <CountTabs
            aria-label="Filter conversations by failures"
            tabs={tabs}
            value={list.failed ? 'failed' : 'all'}
            onValueChange={(tab) => list.setFailed(tab === 'failed')}
            className={className}
            toolbar={
                <div className="flex flex-col gap-4.5 py-4.5">
                    <ConversationFilters
                        agents={agents}
                        searchRef={searchRef}
                    />
                    <ConversationFilterChips
                        searchRef={searchRef}
                        className="-mb-1"
                    />
                </div>
            }
        >
            <ConversationsTable searchRef={searchRef} />
        </CountTabs>
    )
}
