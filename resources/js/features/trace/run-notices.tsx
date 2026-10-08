import { RotateCwIcon, TriangleAlertIcon } from 'lucide-react'
import { useMemo } from 'react'
import type { SpanLimit, TraceDetailResponse } from '@/api/types'
import { Notice } from '@/components/patterns/notice'
import { Button } from '@/components/ui/button'
import type { SpanTree } from '@/features/trace/build-span-tree'
import { FlagLine } from '@/features/trace/flag-line'
import { selectNotices, type RunNotice } from '@/features/trace/select-notices'
import type { Refreshing } from '@/features/trace/use-trace'
import { formatCount, formatDuration } from '@/lib/format'
import { cn } from '@/lib/utils'

type RunNoticesProps = {
    data: TraceDetailResponse['data']
    /** The tree built from `data.spans`. */
    tree: SpanTree
    spanLimit: SpanLimit
    /** Seconds after which an open run counts as abandoned; left out of the words when unknown. */
    staleAfter?: number
    /** Shows a span of the run in the execution view. */
    onShowSpan: (id: string) => void
    onShowMetadata: () => void
    /** Whether the run is refreshing by itself, which the running notice says. */
    refreshing: Refreshing
    onRetryRefresh: () => void
    className?: string
}

/** What the running notice says about refreshing, by how it stands; nothing when it is out of the page's hands. */
const refreshWords: Record<Refreshing, string> = {
    polling: 'This page refreshes by itself.',
    retrying: 'The last refresh failed; trying again.',
    stopped: 'Refreshing stopped after repeated failures.',
    final: '',
    ended: '',
}

/** The notices that apply to the run, if any; see `selectNotices` for which and in what order. */
export function RunNotices({
    data,
    tree,
    spanLimit,
    staleAfter,
    onShowSpan,
    onShowMetadata,
    refreshing,
    onRetryRefresh,
    className,
}: RunNoticesProps) {
    const notices = useMemo(
        () => selectNotices(data, spanLimit, tree),
        [data, spanLimit, tree],
    )

    if (notices.length === 0) {
        return null
    }

    const show = (spanId: string | null) =>
        spanId === null ? null : () => onShowSpan(spanId)

    const render = (notice: RunNotice) => {
        switch (notice.kind) {
            case 'truncated':
                return (
                    <Notice
                        key={notice.kind}
                        tone="info"
                        title={`Showing the first ${formatCount(notice.limit)} of ${formatCount(notice.total)} spans`}
                    >
                        Totals in the header cover the whole run. The tree, the
                        usage table and the coverage cover the spans shown.
                    </Notice>
                )
            case 'running':
                return (
                    <Notice
                        key={notice.kind}
                        tone="info"
                        title="This run is still open in the recording"
                        action={
                            refreshing === 'stopped' ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={onRetryRefresh}
                                >
                                    Try again
                                </Button>
                            ) : undefined
                        }
                    >
                        Usage and completion data are not final yet.{' '}
                        <span className="text-muted-foreground">
                            {refreshWords[refreshing]}
                        </span>
                    </Notice>
                )
            case 'incomplete':
                return (
                    <Notice
                        key={notice.kind}
                        tone="warning"
                        title="This run never reported an end"
                    >
                        {notice.abandoned
                            ? `It was still marked running after the stale timeout${staleAfter === undefined ? '' : ` of ${formatDuration(staleAfter * 1000)}`}, which happens when a stream is abandoned or a worker crashes. `
                            : ''}
                        What was recorded up to that point is shown below.
                    </Notice>
                )
            case 'approval':
                return (
                    <Notice
                        key={notice.kind}
                        tone="info"
                        title={
                            notice.tools.length === 0
                                ? 'Waiting for a tool approval'
                                : `Waiting for approval of: ${notice.tools.join(', ')}`
                        }
                        action={
                            notice.tools.length === 0 ? undefined : (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={onShowMetadata}
                                >
                                    See the waiting tool calls
                                </Button>
                            )
                        }
                    >
                        {notice.tools.length > 1
                            ? 'When they are approved'
                            : 'When it is approved'}
                        , the run that continues is recorded as a separate run.
                    </Notice>
                )
            case 'recovered':
                return (
                    <FlagLine
                        key={notice.kind}
                        icon={RotateCwIcon}
                        showLabel="Show the failed attempt"
                        onShow={show(notice.spanId)}
                    >
                        An earlier attempt failed and the run moved on to
                        another.
                    </FlagLine>
                )
            case 'child-failed':
                return (
                    <FlagLine
                        key={notice.kind}
                        icon={TriangleAlertIcon}
                        showLabel="Show the failed agent"
                        onShow={show(notice.spanId)}
                    >
                        A delegated agent failed.
                        {notice.runFailed ? '' : ' This run carried on.'}
                    </FlagLine>
                )
        }
    }

    return (
        <div
            data-slot="run-notices"
            className={cn('flex flex-col gap-3', className)}
        >
            {notices.map(render)}
        </div>
    )
}
