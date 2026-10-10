import { BotIcon, SearchXIcon } from 'lucide-react'
import { useLocation } from 'react-router'
import { useRef, useState } from 'react'
import { EmptyState } from '@/components/patterns/empty-state'
import { ErrorState } from '@/components/patterns/error-state'
import { HistorySearchField } from '@/components/patterns/history-search-field'
import { Notice } from '@/components/patterns/notice'
import { Pagination } from '@/components/patterns/pagination'
import { Button } from '@/components/ui/button'
import { AgentsTable } from '@/features/agents/agents-table'
import { SortSelect } from '@/features/agents/sort-select'
import { useAgentList } from '@/features/agents/use-agent-list'
import { useAgents } from '@/features/agents/use-agents'
import { useFocusHandoff } from '@/hooks/use-focus-handoff'
import { pageShortcuts, useListShortcuts } from '@/hooks/use-list-shortcuts'
import { useListStatus } from '@/hooks/use-list-status'
import { formatCount } from '@/lib/format'
import { returnTo } from '@/lib/return-context'
import { keyCaps } from '@/lib/shortcuts'

/**
 * The agents that ran in the chosen range: a search by name, how many there are, and the table,
 * sorted and paged by the server and driven by the URL. Each row leads to the agent with the range
 * and the way back to this view.
 */
export function AgentsList({ className }: { className?: string }) {
    const {
        view,
        sort,
        page,
        hasFilters,
        search,
        setSort,
        setPage,
        setSearch,
        clearAll,
    } = useAgentList()
    const { data, isError, error, refetch, isFetching, isPlaceholderData } =
        useAgents(view)
    const { pathname, search: query } = useLocation()
    const searchRef = useRef<HTMLInputElement>(null)
    const tableRef = useRef<HTMLDivElement>(null)

    // The view the rows on screen belong to, as a `from` value. While the table shows the previous
    // view's rows (placeholder data) their links keep leading back to that view; they switch when
    // the new rows arrive, as the range in the links does.
    const currentFrom = returnTo(pathname, query)
    const [rowsFrom, setRowsFrom] = useState(currentFrom)

    if (data !== undefined && !isPlaceholderData && rowsFrom !== currentFrom) {
        setRowsFrom(currentFrom)
    }

    const { failed, retrying, loading, empty, failure } = useListStatus({
        data,
        isError,
        error,
        isFetching,
        isPlaceholderData,
        page,
        setPage,
        viewKey: JSON.stringify(view),
    })

    // The retry button, or the button of the no-match state, goes away when rows replace it.
    useFocusHandoff(failed || (empty && hasFilters))

    useListShortcuts({
        table: tableRef,
        search: searchRef,
        // The page the rows on screen belong to, not the one the URL has moved to.
        pages:
            data === undefined || loading
                ? undefined
                : {
                      page: data.pagination.page,
                      last: data.pagination.last_page,
                      go: setPage,
                  },
    })

    // Counts outside the dimmed table are the current answer's, never the previous view's.
    const current = data !== undefined && !isPlaceholderData && !loading

    return (
        <div className={className}>
            <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                <HistorySearchField
                    placeholder="Search agents…"
                    aria-label="Search agents"
                    value={search}
                    inputRef={searchRef}
                    shortcutHint={keyCaps('search')[0]}
                    onCommit={(text, options) => setSearch(text, options)}
                />
                <SortSelect value={sort} onValueChange={setSort} />
                {current && !failed ? (
                    <p className="text-caption text-muted-foreground md:ml-auto">
                        {formatCount(data.pagination.total)}{' '}
                        {data.pagination.total === 1 ? 'agent' : 'agents'}
                    </p>
                ) : null}
            </div>
            {current && data.agent_limit.truncated ? (
                <Notice
                    tone="warning"
                    title="Only the busiest agents were read"
                    className="mb-4"
                >
                    Trail read the {formatCount(data.agent_limit.limit)} agents
                    with the most runs, and the same number with the most
                    delegated runs, so this list may be incomplete. An
                    agent&rsquo;s own runs or its delegated runs may be missing
                    from it.
                </Notice>
            ) : null}
            {failed ? (
                <ErrorState
                    title="The agents could not be loaded"
                    error={failure}
                    retrying={retrying}
                    onRetry={() => void refetch()}
                />
            ) : (
                <>
                    <AgentsTable
                        agents={data?.data ?? []}
                        // The range the rows were counted over: the previous one while the next loads.
                        ref={tableRef}
                        range={data?.range.preset ?? view.range}
                        from={rowsFrom}
                        sort={sort}
                        onSortChange={setSort}
                        caption="Agents that ran in the selected range"
                        loading={loading}
                        busy={isPlaceholderData}
                        empty={
                            empty ? (
                                hasFilters ? (
                                    <EmptyState
                                        icon={SearchXIcon}
                                        title="No agents match this search"
                                        description="Try another name, or clear the search."
                                    >
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                clearAll()
                                                searchRef.current?.focus()
                                            }}
                                        >
                                            Show all agents
                                        </Button>
                                    </EmptyState>
                                ) : (
                                    <EmptyState
                                        icon={BotIcon}
                                        title="No agents ran in this range"
                                        description="Agents are discovered from recorded runs. A longer range may show more."
                                    />
                                )
                            ) : undefined
                        }
                        footer={
                            data === undefined || loading ? undefined : (
                                <Pagination
                                    // The page the rows on screen belong to, not the one the URL has moved to.
                                    page={data.pagination.page}
                                    perPage={data.pagination.per_page}
                                    total={data.pagination.total}
                                    lastPage={data.pagination.last_page}
                                    onPageChange={setPage}
                                    shortcuts={pageShortcuts()}
                                    noun={{ one: 'agent', other: 'agents' }}
                                />
                            )
                        }
                    />
                    {loading || empty ? null : (
                        <p className="mt-3 text-caption text-muted-foreground">
                            An agent&rsquo;s own runs and its runs as a
                            sub-agent are counted separately. Error rate,
                            duration and cost cover its own runs only.
                        </p>
                    )}
                </>
            )}
        </div>
    )
}
