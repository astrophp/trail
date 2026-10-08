import type { RefObject } from 'react'
import { HistorySearchField } from '@/components/patterns/history-search-field'
import { SelectFilter } from '@/components/patterns/select-filter'
import { useConversationList } from '@/features/conversations/use-conversation-list'
import { cn } from '@/lib/utils'

type ConversationFiltersProps = {
    /** The agents seen in the range; `undefined` while they are not known. */
    agents: string[] | undefined
    searchRef: RefObject<HTMLInputElement | null>
    className?: string
}

/** Search and agent beside the tabs, and a note on what the period selects. */
export function ConversationFilters({
    agents,
    searchRef,
    className,
}: ConversationFiltersProps) {
    const list = useConversationList()

    return (
        <div
            data-slot="conversation-filters"
            className={cn('flex flex-wrap items-center gap-2', className)}
        >
            <HistorySearchField
                placeholder="Search user, conversation, or prompt…"
                aria-label="Search conversations"
                value={list.search}
                inputRef={searchRef}
                onCommit={(search, options) => list.setSearch(search, options)}
                className="mr-1"
            />
            <SelectFilter
                value={list.agent === '' ? null : list.agent}
                onValueChange={(agent) => list.setAgent(agent ?? '')}
                options={(agents ?? []).map((name) => ({
                    value: name,
                    label: name,
                }))}
                allLabel="All agents"
                aria-label="Filter by agent"
            />
            <p className="text-caption text-muted-foreground md:ml-auto">
                Active in the selected period
            </p>
        </div>
    )
}
