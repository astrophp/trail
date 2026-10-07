import { BookmarkIcon } from 'lucide-react'
import type { RefObject } from 'react'
import { SelectFilter } from '@/components/patterns/select-filter'
import { ToggleFilter } from '@/components/patterns/toggle-filter'
import { TraceSearch } from '@/features/traces/trace-search'
import { useTraceList } from '@/features/traces/use-trace-list'
import { cn } from '@/lib/utils'

type TraceFiltersProps = {
    /** The agents seen in the range; `undefined` while they are not known. */
    agents: string[] | undefined
    providers: string[] | undefined
    searchRef: RefObject<HTMLInputElement | null>
    className?: string
}

const toOptions = (names: string[] | undefined) =>
    (names ?? []).map((name) => ({ value: name, label: name }))

/** Search, agent, provider and the bookmarked switch: the filters beside the status tabs. */
export function TraceFilters({
    agents,
    providers,
    searchRef,
    className,
}: TraceFiltersProps) {
    const list = useTraceList()

    return (
        <div
            data-slot="trace-filters"
            className={cn('flex flex-wrap items-center gap-2', className)}
        >
            <TraceSearch
                value={list.search}
                inputRef={searchRef}
                onCommit={(search, options) => list.setSearch(search, options)}
                className="mr-1"
            />
            <SelectFilter
                value={list.agent === '' ? null : list.agent}
                onValueChange={(agent) => list.setAgent(agent ?? '')}
                options={toOptions(agents)}
                allLabel="All agents"
                aria-label="Filter by agent"
            />
            <SelectFilter
                value={list.provider === '' ? null : list.provider}
                onValueChange={(provider) => list.setProvider(provider ?? '')}
                options={toOptions(providers)}
                allLabel="All providers"
                aria-label="Filter by provider"
            />
            <ToggleFilter
                pressed={list.bookmarked}
                onPressedChange={list.setBookmarked}
                className="md:ml-auto"
            >
                <BookmarkIcon aria-hidden="true" />
                Bookmarked
            </ToggleFilter>
        </div>
    )
}
