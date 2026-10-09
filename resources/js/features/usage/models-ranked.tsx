import type { Leader } from '@/lib/refresh-policy'
import { useMemo, useRef } from 'react'
import { Link } from 'react-router'
import { failureMessage } from '@/api/client'
import { linkRows, unlinkable } from '@/api/traces-link'
import { PanelEmpty } from '@/components/patterns/panel-empty'
import { PanelError } from '@/components/patterns/panel-error'
import { RankedList } from '@/components/patterns/ranked-list'
import { RankedListSkeleton } from '@/components/patterns/ranked-list-skeleton'
import { RefreshNote } from '@/components/patterns/refresh-note'
import type { ActivityMode } from '@/components/telemetry/activity-mode'
import { Button } from '@/components/ui/button'
import { RankedModelRow } from '@/features/usage/ranked-model-row'
import {
    rankedModelsShown,
    rankingFor,
    rankingNote,
    usageModelsLink,
} from '@/features/usage/ranked-models'
import { useRankedModels } from '@/features/usage/use-ranked-models'
import { useFocusHandoff } from '@/hooks/use-focus-handoff'
import { useQueryStatus } from '@/hooks/use-query-status'
import { useTimeRange } from '@/hooks/use-time-range'
import { useUnlinkedReport } from '@/hooks/use-unlinked-report'
import type {} from '@/lib/refresh-policy'
import { cn } from '@/lib/utils'

type ModelsRankedProps = {
    /** What the page's activity chart shows, which decides what the models are ranked by. */
    metric: ActivityMode
    /** The page's one query for its figures, which the list follows once it settles. */
    leader: Leader
    className?: string
}

/**
 * The models the runs of the range used, the first few of the usage breakdown, each linking to
 * the runs behind it. It ranks by the figure the chart beside it shows as far as the breakdown
 * can: runs for Volume, estimated cost for Cost, and runs for Duration, which the breakdown does
 * not have per model, and the list says so.
 *
 * It is a request of its own with states of its own, so a slow or failed read leaves whatever it
 * sits in as it is. While the next range loads, the previous range's rows stay, dimmed, and keep
 * the range they were counted over.
 */
export function ModelsRanked({ metric, leader, className }: ModelsRankedProps) {
    const [range] = useTimeRange()
    const sort = rankingFor[metric]
    const headingRef = useRef<HTMLHeadingElement>(null)
    const query = useRankedModels(range, sort, leader)
    const { data, isError, isPlaceholderData } = query
    const { failed, retrying, failure, loading } = useQueryStatus(
        query,
        `${range} ${sort}`,
    )
    // The range the rows were counted over: the previous one while the next loads.
    const counted = data?.range.preset ?? range
    const models = useMemo(
        () => (data?.by === 'model' ? data.data : []),
        [data],
    )
    const linked = useMemo(() => linkRows(models, counted), [models, counted])
    // An empty placeholder is the previous range's "nothing": it says nothing about this one.
    const waiting = loading || (isPlaceholderData && models.length === 0)
    const dimmed = isPlaceholderData && models.length > 0 && !failed
    // The last refresh failed and the rows are from before it.
    const outdated = isError && data !== undefined && !failed

    useUnlinkedReport('model', unlinkable(linked))
    // The retry button goes away when the rows replace it.
    useFocusHandoff(failed || outdated, headingRef)

    const body = () => {
        if (failed) {
            return (
                <PanelError
                    title="The models could not be loaded"
                    message={failureMessage(failure)}
                    onRetry={() => {
                        if (!retrying) {
                            void query.refetch()
                        }
                    }}
                    className="px-0 py-4"
                />
            )
        }

        if (waiting) {
            return <RankedListSkeleton count={rankedModelsShown} />
        }

        if (models.length === 0) {
            return (
                <PanelEmpty
                    title="No model usage in this range"
                    className="px-0 py-4"
                />
            )
        }

        return (
            <div className="flex flex-col gap-3">
                <p className="text-caption text-muted-foreground">
                    {rankingNote(metric, data?.row_limit.truncated ?? false)}
                </p>
                <RankedList aria-label="Models in this range">
                    {linked.map(({ row, to }) => (
                        <RankedModelRow
                            key={`${row.provider}\n${row.model}`}
                            model={row}
                            figure={sort === '-cost' ? 'cost' : 'runs'}
                            to={to ?? undefined}
                            unlinkable={to === null}
                        />
                    ))}
                </RankedList>
            </div>
        )
    }

    return (
        <div
            data-slot="models-ranked"
            className={cn('flex flex-col gap-3', className)}
        >
            {/* Always mounted, so a change of its text is announced; outside the busy part, where it may be muted. */}
            <span role="status" className="sr-only">
                {dimmed ? 'Loading the models' : ''}
            </span>
            <div className="flex items-center justify-between gap-2">
                <h3
                    ref={headingRef}
                    // Where focus goes when the control it was on goes away.
                    tabIndex={-1}
                    className="text-ui font-medium outline-none"
                >
                    Models
                </h3>
                {data !== undefined &&
                !failed &&
                data.pagination.total > rankedModelsShown ? (
                    <Button asChild variant="link" size="sm">
                        <Link
                            to={usageModelsLink(counted, sort)}
                            aria-label="View all models"
                        >
                            View all
                        </Link>
                    </Button>
                ) : null}
            </div>
            {outdated ? (
                <RefreshNote
                    refreshing="ended"
                    failed
                    onRetry={() => void query.refreshAgain()}
                    className="mb-0"
                />
            ) : null}
            <div
                aria-busy={dimmed ? true : undefined}
                className={cn(
                    'motion-safe:transition-opacity',
                    dimmed && 'opacity-60',
                )}
            >
                {body()}
            </div>
        </div>
    )
}
