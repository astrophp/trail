import { ChartColumnIcon } from 'lucide-react'
import { failureMessage } from '@/api/client'
import { usageExportUrl, type UsageGrouping } from '@/api/usage'
import { CountTabs, type CountTab } from '@/components/patterns/count-tabs'
import { EmptyState } from '@/components/patterns/empty-state'
import { ExportLinkButton } from '@/components/patterns/export-link-button'
import { Notice } from '@/components/patterns/notice'
import { Pagination } from '@/components/patterns/pagination'
import { Panel } from '@/components/patterns/panel'
import { PanelContent } from '@/components/patterns/panel-content'
import { PanelError } from '@/components/patterns/panel-error'
import { PanelHeader } from '@/components/patterns/panel-header'
import { RefreshNote } from '@/components/patterns/refresh-note'
import { UsageTable } from '@/features/usage/usage-table'
import { useUsageBreakdown } from '@/features/usage/use-usage-breakdown'
import { useUsageList } from '@/features/usage/use-usage-list'
import { useFocusHandoff } from '@/hooks/use-focus-handoff'
import { useListStatus } from '@/hooks/use-list-status'
import { formatCount } from '@/lib/format'
import type { Refreshing } from '@/lib/refresh-policy'
import { timeRangeLabels } from '@/lib/time-range'

const tabs: (CountTab & { value: UsageGrouping })[] = [
    { value: 'model', label: 'By model' },
    { value: 'agent', label: 'By top-level agent' },
    { value: 'provider', label: 'By provider' },
]

/** What the rows of each grouping are, for the table's name. */
const groups: Record<UsageGrouping, string> = {
    model: 'model',
    agent: 'top-level agent',
    provider: 'provider',
}

const isGrouping = (value: string): value is UsageGrouping =>
    tabs.some((tab) => tab.value === value)

type UsageBreakdownProps = {
    /** The page's one query for the totals, which the breakdown follows once it settles. */
    leader: {
        dataUpdatedAt: number
        isPlaceholderData: boolean
        refreshing: Refreshing
    }
    /** The page already says that its last refresh failed, so this says it no more. */
    refreshNoted?: boolean
    className?: string
}

/**
 * The usage of the range by model, by top-level agent or by provider: tabs for the view, and a
 * table of its rows sorted and paged by the server, driven by the URL. It is a request of its own,
 * so a failure here leaves the totals as they are; while a sort or the next page loads, the
 * previous rows stay, dimmed.
 */
export function UsageBreakdown({
    leader,
    refreshNoted = false,
    className,
}: UsageBreakdownProps) {
    const { view, by, sort, page, setBy, setSort, setPage } = useUsageList()
    const breakdown = useUsageBreakdown(view, leader)
    const { data, isError, error, refetch, isFetching, isPlaceholderData } =
        breakdown
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

    // The retry button, or the one of the refresh note, goes away when the rows load.
    useFocusHandoff(failed || (isError && !refreshNoted))

    // Counts and notes outside the dimmed table are the current answer's, never the previous view's.
    const current = data !== undefined && !isPlaceholderData && !loading
    // What the rows on screen are grouped by and counted over: the previous view's while the next loads.
    const shownBy = data?.by ?? by
    const shownRange = data?.range.preset ?? view.range

    return (
        <div className={className}>
            {current && data.row_limit.truncated ? (
                <Notice
                    tone="warning"
                    title="Only part of the usage was read"
                    className="mb-4"
                >
                    Trail read {formatCount(data.row_limit.limit)} groups, and
                    there were more, so this list may be incomplete.
                </Notice>
            ) : null}
            {loading || failed || refreshNoted ? null : (
                <RefreshNote
                    refreshing={breakdown.refreshing}
                    failed={isError}
                    onRetry={() => void breakdown.refreshAgain()}
                />
            )}
            <Panel>
                <PanelHeader
                    title="Usage breakdown"
                    action={
                        <ExportLinkButton
                            href={usageExportUrl({
                                range: view.range,
                                by,
                                sort,
                            })}
                            label={`Export the breakdown by ${groups[by]} as CSV`}
                            title="Every page of this view"
                            size="sm"
                        >
                            Export CSV
                        </ExportLinkButton>
                    }
                />
                <PanelContent className="p-0">
                    <CountTabs
                        aria-label="Group the usage by"
                        tabs={tabs}
                        value={by}
                        onValueChange={(next) => {
                            if (isGrouping(next)) {
                                setBy(next)
                            }
                        }}
                        className="[&_[role=tablist]]:px-5"
                    >
                        {failed ? (
                            <PanelError
                                title="The usage breakdown could not be loaded"
                                message={failureMessage(failure)}
                                onRetry={() => {
                                    if (!retrying) {
                                        void refetch()
                                    }
                                }}
                            />
                        ) : (
                            <>
                                <UsageTable
                                    rows={data?.data ?? []}
                                    by={shownBy}
                                    range={shownRange}
                                    sort={sort}
                                    onSortChange={setSort}
                                    caption={`Usage by ${groups[shownBy]} in the selected range`}
                                    loading={loading}
                                    busy={isPlaceholderData}
                                    className="rounded-none border-0"
                                    empty={
                                        empty ? (
                                            <EmptyState
                                                icon={ChartColumnIcon}
                                                title="No recorded usage in this range"
                                                description={`Nothing was recorded in the ${timeRangeLabels[shownRange].toLowerCase()}. A longer range may show more.`}
                                            />
                                        ) : undefined
                                    }
                                    footer={
                                        data === undefined ||
                                        loading ||
                                        data.pagination.last_page <=
                                            1 ? undefined : (
                                            <Pagination
                                                // The page the rows on screen belong to, not the one the URL has moved to.
                                                page={data.pagination.page}
                                                perPage={
                                                    data.pagination.per_page
                                                }
                                                total={data.pagination.total}
                                                lastPage={
                                                    data.pagination.last_page
                                                }
                                                onPageChange={setPage}
                                                noun={{
                                                    one: groups[shownBy],
                                                    other: `${groups[shownBy]}s`,
                                                }}
                                                className="px-4 py-3"
                                            />
                                        )
                                    }
                                />
                                {breakdown.waitingForLeader && current ? (
                                    <p
                                        data-slot="waiting-note"
                                        className="px-5 py-3 text-caption text-muted-foreground"
                                    >
                                        Updates when the runs in flight finish
                                    </p>
                                ) : null}
                            </>
                        )}
                    </CountTabs>
                </PanelContent>
            </Panel>
        </div>
    )
}
