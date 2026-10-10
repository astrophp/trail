import type { RefObject } from 'react'
import { FilterChips } from '@/components/patterns/filter-chips'
import { useTraceList } from '@/features/traces/use-trace-list'

/** The filters that are on, each removable. Nothing is shown when none is. */
export function TraceFilterChips({
    searchRef,
    className,
}: {
    searchRef: RefObject<HTMLInputElement | null>
    className?: string
}) {
    const { activeFilters, clear, clearAll } = useTraceList()

    return (
        <FilterChips
            chips={activeFilters.map(({ key, label }) => ({
                key,
                label,
                onRemove: () => clear([key]),
            }))}
            focusWhenEmpty={searchRef}
            className={className}
            onClearAll={clearAll}
        />
    )
}
