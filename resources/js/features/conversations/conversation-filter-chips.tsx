import type { RefObject } from 'react'
import { FilterChips } from '@/components/patterns/filter-chips'
import { useConversationList } from '@/features/conversations/use-conversation-list'

/** The search and agent filters that are on, each removable. Nothing is shown when none is. */
export function ConversationFilterChips({
    searchRef,
    className,
}: {
    searchRef: RefObject<HTMLInputElement | null>
    className?: string
}) {
    const { activeFilters, clear } = useConversationList()

    return (
        <FilterChips
            chips={activeFilters.map(({ key, label }) => ({
                key,
                label,
                onRemove: () => clear([key]),
            }))}
            focusWhenEmpty={searchRef}
            className={className}
            // The tab is not a chip, so "Clear all" leaves it where it is.
            onClearAll={() => clear(['search', 'agent'])}
        />
    )
}
