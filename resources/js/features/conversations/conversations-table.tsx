import { MessageSquareIcon, SearchXIcon } from 'lucide-react'
import type { RefObject } from 'react'
import { conversationSorts } from '@/api/conversations'
import { DataTable } from '@/components/patterns/data-table'
import { EmptyState } from '@/components/patterns/empty-state'
import { ErrorState } from '@/components/patterns/error-state'
import { Pagination } from '@/components/patterns/pagination'
import { Button } from '@/components/ui/button'
import { conversationColumns } from '@/features/conversations/conversation-columns'
import { useConversationList } from '@/features/conversations/use-conversation-list'
import { useConversations } from '@/features/conversations/use-conversations'
import { useFocusHandoff } from '@/hooks/use-focus-handoff'
import { useListStatus } from '@/hooks/use-list-status'
import { toApiSort, toTableSort } from '@/lib/table-sort'

const getRowId = (conversation: { id: string }) => conversation.id

/** The conversations of the chosen range: sorted and paged by the server, driven by the URL. */
export function ConversationsTable({
    searchRef,
    className,
}: {
    /** Where focus goes when the filters are cleared from here: the same place "Clear all" leaves it. */
    searchRef: RefObject<HTMLInputElement | null>
    className?: string
}) {
    const { view, sort, page, hasFilters, setSort, setPage, clearAll } =
        useConversationList()
    const { data, isError, error, refetch, isFetching, isPlaceholderData } =
        useConversations(view)

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

    // The retry button, or the button of a no-match state, goes away when rows replace it.
    useFocusHandoff(failed || (empty && hasFilters))

    if (failed) {
        return (
            <ErrorState
                title="The conversations could not be loaded"
                error={failure}
                retrying={retrying}
                className={className}
                onRetry={() => void refetch()}
            />
        )
    }

    return (
        <div className={className}>
            <DataTable
                loading={loading}
                busy={isPlaceholderData}
                columns={conversationColumns}
                data={data?.data ?? []}
                getRowId={getRowId}
                sort={toTableSort(sort)}
                onSortChange={(next) =>
                    setSort(toApiSort(conversationSorts, next))
                }
                caption="Recorded conversations"
                empty={
                    empty ? (
                        hasFilters ? (
                            <EmptyState
                                icon={SearchXIcon}
                                title="No conversations match these filters"
                                description="Try removing a filter or searching for something else."
                            >
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        clearAll()
                                        searchRef.current?.focus()
                                    }}
                                >
                                    Clear filters
                                </Button>
                            </EmptyState>
                        ) : (
                            <EmptyState
                                icon={MessageSquareIcon}
                                title="No conversations in this period"
                                description="A conversation appears when an agent uses the SDK's conversation memory. Runs without one are on the Traces page."
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
                            noun={{
                                one: 'conversation',
                                other: 'conversations',
                            }}
                        />
                    )
                }
            />
            {loading || empty ? null : (
                <p className="mt-3 text-caption text-muted-foreground">
                    Totals cover every recorded turn of a conversation,
                    including turns outside the selected period.
                </p>
            )}
        </div>
    )
}
