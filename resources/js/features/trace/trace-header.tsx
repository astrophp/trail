import { ArrowLeftIcon, MessageSquareIcon, UserIcon } from 'lucide-react'
import { Link } from 'react-router'
import type { TraceDetailResponse } from '@/api/types'
import { CopyButton } from '@/components/patterns/copy-button'
import { KeyValue } from '@/components/patterns/key-value'
import { KeyValueList } from '@/components/patterns/key-value-list'
import { notify } from '@/components/patterns/notify'
import { PageHeader } from '@/components/patterns/page-header'
import { AgentIcon } from '@/components/telemetry/agent-icon'
import { BookmarkToggle } from '@/components/telemetry/bookmark-toggle'
import { CostValue } from '@/components/telemetry/cost-value'
import { DurationValue } from '@/components/telemetry/duration-value'
import { ErrorSummary } from '@/components/telemetry/error-summary'
import { IssueLabel } from '@/components/telemetry/issue-label'
import { ModelLabel } from '@/components/telemetry/model-label'
import { StatusBadge } from '@/components/telemetry/status-badge'
import { Timestamp } from '@/components/telemetry/timestamp'
import { TokenValue } from '@/components/telemetry/token-value'
import { TraceFlags } from '@/components/telemetry/trace-flags'
import { UserLabel } from '@/components/telemetry/user-label'
import { TraceId } from '@/components/telemetry/trace-id'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useTimeRangeLink } from '@/hooks/use-time-range'
import { formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'

type TraceHeaderProps = {
    trace: TraceDetailResponse['data']['trace']
    /** How the run failed, shown right under the header; `null` when it was not recorded. */
    error: TraceDetailResponse['data']['detail']['error']
    onBookmarkChange: (bookmarked: boolean) => void
    className?: string
}

/** One figure of the strip: a quiet label over a large value, with a rule before it when the strip is a row. */
const stat = 'md:border-s md:ps-6 md:first:border-s-0 md:first:ps-0'
const figure = 'text-heading tabular-nums'

/**
 * Which run this is and how it went: its name and outcome, its whole id and start, then a strip of
 * the figures that matter (elapsed time, tokens, cost, spans and the model) with who ran it at the
 * end, and the bookmark. A run that failed shows its error here, so the cause is on screen before
 * anything is selected.
 */
export function TraceHeader({
    trace,
    error,
    onBookmarkChange,
    className,
}: TraceHeaderProps) {
    const linkTo = useTimeRangeLink()

    return (
        <header
            data-slot="trace-header"
            className={cn('flex flex-col gap-4', className)}
        >
            <Button
                asChild
                variant="ghost"
                size="xs"
                className="-ms-2 self-start text-muted-foreground"
            >
                <Link to={linkTo('/traces')}>
                    <ArrowLeftIcon aria-hidden="true" />
                    Back to traces
                </Link>
            </Button>
            <PageHeader
                title={trace.name}
                // The bookmark stays beside the title on a narrow screen; the id wraps instead.
                className="flex-nowrap"
                icon={<AgentIcon type={trace.type} className="size-5" />}
                badge={
                    <>
                        <StatusBadge status={trace.status} tinted />
                        <TraceFlags trace={trace} className="flex-row gap-3" />
                        {/* A failed run's issue is the first line of the error shown below. */}
                        {trace.issue_kind === null ||
                        trace.status === 'failed' ? null : (
                            <IssueLabel
                                kind={trace.issue_kind}
                                className="text-xs text-muted-foreground"
                            />
                        )}
                    </>
                }
                description={
                    <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span className="flex min-w-0 items-center gap-1">
                            <TraceId full id={trace.id} />
                            <CopyButton
                                text={trace.id}
                                label="Copy run id"
                                onCopied={() =>
                                    notify.success('Run id copied.')
                                }
                                onFailed={() =>
                                    notify.error(
                                        'The run id could not be copied.',
                                    )
                                }
                            />
                        </span>
                        <Timestamp at={trace.started_at} layout="inline" />
                    </span>
                }
            >
                <BookmarkToggle
                    trace={trace}
                    onPressedChange={onBookmarkChange}
                />
            </PageHeader>
            <Separator />
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-8">
                <KeyValueList className="grid-cols-2 gap-y-4 md:flex md:flex-wrap md:items-center md:gap-x-6">
                    <KeyValue label="Elapsed" className={stat}>
                        <DurationValue of={trace} className={figure} />
                    </KeyValue>
                    <KeyValue label="Total tokens" className={stat}>
                        <TokenValue usage={trace.usage} className={figure} />
                    </KeyValue>
                    <KeyValue label="Estimated cost" className={stat}>
                        <CostValue cost={trace.cost} className={figure} />
                    </KeyValue>
                    <KeyValue label="Spans" className={stat}>
                        <span className={figure}>
                            {formatCount(trace.span_count)}
                        </span>
                    </KeyValue>
                    <KeyValue label="Model" className={stat}>
                        <ModelLabel of={trace} />
                    </KeyValue>
                </KeyValueList>
                {trace.user === null &&
                trace.conversation_id === null ? null : (
                    <div className="flex min-w-0 flex-col gap-1.5 text-ui md:items-end md:text-end">
                        {trace.user === null ? null : (
                            <span className="flex min-w-0 items-center gap-1.5">
                                <UserIcon
                                    aria-hidden="true"
                                    className="size-3.5 shrink-0 text-muted-foreground"
                                />
                                <span className="sr-only">User</span>
                                <UserLabel user={trace.user} />
                            </span>
                        )}
                        {trace.conversation_id === null ? null : (
                            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                                <MessageSquareIcon
                                    aria-hidden="true"
                                    className="size-3.5 shrink-0"
                                />
                                <span className="sr-only">Conversation</span>
                                <span className="font-mono text-xs wrap-anywhere">
                                    {trace.conversation_id}
                                </span>
                            </span>
                        )}
                    </div>
                )}
            </div>
            <Separator />
            {trace.status === 'failed' ? (
                <ErrorSummary error={error} issueKind={trace.issue_kind} />
            ) : null}
        </header>
    )
}
