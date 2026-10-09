import { SearchXIcon } from 'lucide-react'
import { useId, useMemo } from 'react'
import { Link } from 'react-router'
import { tracesLink } from '@/api/traces-link'
import { DataTable } from '@/components/patterns/data-table'
import { EmptyState } from '@/components/patterns/empty-state'
import { ErrorState } from '@/components/patterns/error-state'
import { RefreshNote } from '@/components/patterns/refresh-note'
import { recentTraceColumns } from '@/features/traces/trace-columns'
import {
    useRecentTraces,
    type RecentTracesLeader,
} from '@/features/traces/use-recent-traces'
import { useFocusHandoff } from '@/hooks/use-focus-handoff'
import { useQueryStatus } from '@/hooks/use-query-status'
import { formatCount } from '@/lib/format'
import type { TimeRangePreset } from '@/lib/time-range'
import { cn } from '@/lib/utils'

const getRowId = (trace: { id: string }) => trace.id

/** The rows come newest first; nothing here sorts them. */
const sort = { id: 'started_at', desc: true }

type RecentTracesProps = {
    /** Whose runs: the name as the runs spell it. */
    agent: string
    /** The range of the data shown beside the list, which the list and its link follow. */
    range: TimeRangePreset
    /** How many runs are listed. */
    limit: number
    /**
     * The page the list sits on, as a `from` value (see `returnTo`): a run opened from here leads
     * back to it.
     */
    returnTarget: string
    /** What the list keeps up with: the query of the page it sits on, which is asked again while a run runs. */
    leader: RecentTracesLeader
    className?: string
}

/**
 * The latest runs of one agent, as a way into them: the traces list's own rows without its
 * checkboxes, bookmarks, sorting, tabs, filters and pages, under a heading with the way to the
 * whole list. The count in that link is the list's own total, and is only said while it is the
 * answer for this agent and range, never the previous range's.
 */
export function RecentTraces({
    agent,
    range,
    limit,
    returnTarget,
    leader,
    className,
}: RecentTracesProps) {
    const headingId = useId()
    const traces = useRecentTraces(agent, range, limit, leader)
    const { data, isError, isPlaceholderData } = traces
    const status = useQueryStatus(traces, JSON.stringify([agent, range, limit]))
    const { failed, retrying, failure } = status
    // An empty placeholder is the previous range's "no runs": it says nothing about this one.
    const loading =
        status.loading || (isPlaceholderData && data?.data.length === 0)
    const columns = useMemo(
        () => recentTraceColumns(returnTarget),
        [returnTarget],
    )

    // The retry button, or the one of the stopped notice, goes away when the list recovers.
    useFocusHandoff(failed || traces.refreshing === 'stopped')

    // The range the rows were fetched for: the previous one while the next loads.
    const shown = data?.range.preset ?? range
    const total =
        data === undefined || isPlaceholderData || loading
            ? undefined
            : data.pagination.total

    return (
        <section
            aria-labelledby={headingId}
            data-slot="recent-traces"
            className={cn('flex flex-col gap-3', className)}
        >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 id={headingId} className="text-heading">
                    Recent traces
                </h2>
                {total === undefined || total === 0 ? null : (
                    <Link
                        to={tracesLink(shown, { agent })}
                        className="rounded-sm text-ui text-primary-ink outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                        View all {formatCount(total)}
                        <span className="sr-only"> traces of {agent}</span>
                    </Link>
                )}
            </div>
            {failed ? (
                <ErrorState
                    title="The recent traces could not be loaded"
                    error={failure}
                    retrying={retrying}
                    onRetry={() => void traces.refetch()}
                />
            ) : (
                <div>
                    {loading ? null : (
                        <RefreshNote
                            refreshing={traces.refreshing}
                            failed={isError}
                            onRetry={() => void traces.refreshAgain()}
                        />
                    )}
                    <DataTable
                        loading={loading}
                        busy={isPlaceholderData}
                        skeletonRows={3}
                        columns={columns}
                        data={data?.data ?? []}
                        getRowId={getRowId}
                        sort={sort}
                        onSortChange={() => {}}
                        caption={`Recent traces of ${agent}`}
                        empty={
                            <EmptyState
                                icon={SearchXIcon}
                                title="No runs found"
                                description="No run of this agent started in this range."
                            />
                        }
                    />
                </div>
            )}
        </section>
    )
}
