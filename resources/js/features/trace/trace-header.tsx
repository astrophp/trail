import type { TraceDetailResponse } from '@/api/types'
import { CopyButton } from '@/components/patterns/copy-button'
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
import { formatCount } from '@/lib/format'
import { Fact } from '@/features/trace/fact'
import { cn } from '@/lib/utils'

type TraceHeaderProps = {
    trace: TraceDetailResponse['data']['trace']
    /** How the run failed, shown right under the header; `null` when it was not recorded. */
    error: TraceDetailResponse['data']['detail']['error']
    onBookmarkChange: (bookmarked: boolean) => void
    className?: string
}

/**
 * Which run this is and how it went: its name and id, outcome, model, duration, tokens, cost,
 * start, who ran it, and the bookmark. A run that failed shows its error here, so the cause is
 * on screen before anything is selected.
 */
export function TraceHeader({
    trace,
    error,
    onBookmarkChange,
    className,
}: TraceHeaderProps) {
    return (
        <header
            data-slot="trace-header"
            className={cn('flex flex-col gap-4', className)}
        >
            <PageHeader
                title={trace.name}
                icon={<AgentIcon type={trace.type} className="size-5" />}
            >
                <BookmarkToggle
                    trace={trace}
                    onPressedChange={onBookmarkChange}
                />
            </PageHeader>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="flex items-center gap-1">
                    <TraceId id={trace.id} />
                    <CopyButton
                        text={trace.id}
                        label="Copy run id"
                        onCopied={() => notify.success('Run id copied.')}
                        onFailed={() =>
                            notify.error('The run id could not be copied.')
                        }
                    />
                </span>
                <StatusBadge status={trace.status} />
                <TraceFlags trace={trace} className="flex-row gap-3" />
                {/* A failed run's issue is the first line of the error shown below. */}
                {trace.issue_kind === null ||
                trace.status === 'failed' ? null : (
                    <IssueLabel
                        kind={trace.issue_kind}
                        className="text-xs text-muted-foreground"
                    />
                )}
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4 wide:grid-cols-6">
                <Fact label="Model">
                    <ModelLabel of={trace} />
                </Fact>
                <Fact label="Duration">
                    <DurationValue of={trace} />
                </Fact>
                <Fact label="Tokens">
                    <TokenValue usage={trace.usage} />
                </Fact>
                <Fact label="Est. cost">
                    <CostValue cost={trace.cost} />
                </Fact>
                <Fact label="Started">
                    <Timestamp at={trace.started_at} />
                </Fact>
                <Fact label="Spans">
                    <span className="tabular-nums">
                        {formatCount(trace.span_count)}
                    </span>
                </Fact>
                {trace.user === null ? null : (
                    <Fact label="User">
                        <UserLabel user={trace.user} />
                    </Fact>
                )}
                {trace.conversation_id === null ? null : (
                    <Fact label="Conversation">
                        <span className="font-mono text-xs break-all">
                            {trace.conversation_id}
                        </span>
                    </Fact>
                )}
            </dl>
            {trace.status === 'failed' ? (
                <ErrorSummary error={error} issueKind={trace.issue_kind} />
            ) : null}
        </header>
    )
}
