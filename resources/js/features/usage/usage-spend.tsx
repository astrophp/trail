import { failureMessage } from '@/api/client'
import { usageSpendExportUrl } from '@/api/usage'
import type { UsageSpendResponse } from '@/api/types'
import { BusyRegion } from '@/components/patterns/busy-region'
import { ExportLinkButton } from '@/components/patterns/export-link-button'
import { Panel } from '@/components/patterns/panel'
import { PanelContent } from '@/components/patterns/panel-content'
import { PanelError } from '@/components/patterns/panel-error'
import { PanelHeader } from '@/components/patterns/panel-header'
import { PanelLoading } from '@/components/patterns/panel-loading'
import { RefreshNote } from '@/components/patterns/refresh-note'
import { TimeSeriesChart } from '@/components/patterns/time-series-chart'
import {
    bucketLabels,
    timeZoneNote,
} from '@/components/telemetry/bucket-labels'
import { SpendFigures } from '@/features/usage/spend-figures'
import {
    hasRecordedAmount,
    spendChartInput,
} from '@/features/usage/spend-series'
import { SpendTable } from '@/features/usage/spend-table'
import {
    assumptionSentence,
    leftOutSentence,
    noProjectionSentence,
    spendSummary,
} from '@/features/usage/spend-words'
import { useUsageSpend } from '@/features/usage/use-usage-spend'
import { useBoot } from '@/hooks/use-boot'
import { useFocusHandoff } from '@/hooks/use-focus-handoff'
import { useQueryStatus } from '@/hooks/use-query-status'
import { useTimeRange } from '@/hooks/use-time-range'
import { formatCost, resolveTimeZone } from '@/lib/format'
import type { Refreshing } from '@/lib/refresh-policy'
import { timeRangePeriods } from '@/lib/time-range'

/** What there is to say instead of a chart when no bucket has an amount, by the state of what was recorded. */
const nothingToDraw: Record<
    UsageSpendResponse['data']['series']['buckets'][number]['cumulative']['state'],
    string
> = {
    not_captured:
        'No usage was recorded in this range, so there is no estimated cost to draw.',
    unpriced:
        'Usage was recorded in this range, but none of it could be priced, so there is no estimated cost to draw.',
    pending:
        'Runs in this range are still running and no estimated cost has been recorded yet.',
    // Neither has an amount to be missing, so a series with one is drawn.
    estimated: 'No estimated cost was recorded in this range.',
    partial: 'No estimated cost was recorded in this range.',
}

const caption = 'text-caption text-muted-foreground'

type UsageSpendProps = {
    /** The page's one query for the totals, which this follows once it settles. */
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
 * The estimated cost recorded through the range, accumulating bucket by bucket, and beside it a
 * dashed projection of the next period. It is a request of its own, so a failure here leaves the
 * totals as they are; while the next range loads, the previous one's chart stays, dimmed. The
 * numbers are the response's own and the sentences say what they assume: the projection is never
 * worded or drawn as cost.
 */
export function UsageSpend({
    leader,
    refreshNoted = false,
    className,
}: UsageSpendProps) {
    const [range] = useTimeRange()
    const spend = useUsageSpend(range, leader)
    const timeZone = resolveTimeZone(useBoot().timezone)
    const { data, isError, isPlaceholderData, refetch } = spend
    const { failed, retrying, failure, loading } = useQueryStatus(spend, range)

    // The retry button, or the one of the refresh note, goes away when the chart loads.
    useFocusHandoff(failed || (isError && !refreshNoted))

    const shown = data !== undefined && !loading ? data : undefined
    // The range the chart on screen is for: the previous one while the next loads.
    const shownRange = data?.range.preset ?? range
    const period = timeRangePeriods[shownRange]

    let body = <PanelLoading rows={6} />

    if (failed) {
        body = (
            <PanelError
                title="The estimated cost could not be loaded"
                message={failureMessage(failure)}
                onRetry={() => {
                    if (!retrying) {
                        void refetch()
                    }
                }}
            />
        )
    } else if (shown !== undefined) {
        body = (
            <BusyRegion
                busy={isPlaceholderData}
                label="Loading the estimated cost"
            >
                <SpendContent
                    data={shown.data}
                    period={period}
                    timeZone={timeZone}
                />
            </BusyRegion>
        )
    }

    return (
        <div className={className}>
            {loading || failed || refreshNoted ? null : (
                <RefreshNote
                    refreshing={spend.refreshing}
                    failed={isError}
                    onRetry={() => void spend.refreshAgain()}
                />
            )}
            <Panel>
                <PanelHeader
                    title="Estimated cost over time"
                    description="Cumulative US dollars · estimates"
                    action={
                        <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2">
                            {shown === undefined ? null : (
                                <SpendFigures
                                    data={shown.data}
                                    period={period}
                                />
                            )}
                            <ExportLinkButton
                                href={usageSpendExportUrl({ range })}
                                label="Export the estimated cost and its projection as CSV"
                                title="Every bucket of this range, and the projected ones"
                                size="sm"
                            >
                                Export CSV
                            </ExportLinkButton>
                        </div>
                    }
                />
                <PanelContent>{body}</PanelContent>
            </Panel>
        </div>
    )
}

function SpendContent({
    data,
    period,
    timeZone,
}: {
    data: UsageSpendResponse['data']
    period: string
    timeZone: string | undefined
}) {
    const { series, projection } = data
    const unit = series.bucket
    const input = spendChartInput(data)
    const labels = bucketLabels(unit, input.labelled, timeZone)
    const drawn = hasRecordedAmount(series.buckets)
    const last = series.buckets.at(-1)
    const projected = input.projected !== null
    // Why there is no projection, or what the one there is assumes, and what it left out.
    const assumption =
        projection.state === 'projected' && projection.window !== null
            ? assumptionSentence(unit, projection.window)
            : noProjectionSentence(unit, projection)
    const explanation = [assumption, leftOutSentence(projection.left_out)]
        .filter((sentence) => sentence !== null)
        .join(' ')

    return (
        <div className="flex min-w-0 flex-col gap-2">
            {drawn ? (
                <TimeSeriesChart
                    buckets={input.buckets}
                    line={input.recorded}
                    dashedLine={input.projected ?? undefined}
                    divider={
                        projected
                            ? { at: input.lastRecorded, label: 'Now' }
                            : undefined
                    }
                    shadeFrom={projected ? input.lastRecorded : undefined}
                    table={
                        <SpendTable
                            data={data}
                            formatBucket={labels.formatBucket}
                        />
                    }
                    {...labels}
                    formatValue={formatCost}
                    missingLabel="No amount"
                    summary={spendSummary(data, period)}
                    emptyLabel="No buckets in this range"
                    zeroLabel="Every estimated cost recorded in this range is zero"
                />
            ) : (
                <p
                    data-slot="spend-nothing"
                    className="text-ui text-muted-foreground"
                >
                    {nothingToDraw[last?.cumulative.state ?? 'not_captured']}
                </p>
            )}
            {explanation === '' ? null : (
                <p data-slot="spend-assumption" className={caption}>
                    {explanation}
                </p>
            )}
            {drawn ? <p className={caption}>{timeZoneNote(timeZone)}</p> : null}
        </div>
    )
}
