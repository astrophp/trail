import { ChevronDownIcon } from 'lucide-react'
import { useId, useState } from 'react'
import type { Turn } from '@/api/types'
import { ErrorSummary } from '@/components/telemetry/error-summary'
import { IssueLabel } from '@/components/telemetry/issue-label'
import { StatusBadge } from '@/components/telemetry/status-badge'
import { Timestamp } from '@/components/telemetry/timestamp'
import { Button } from '@/components/ui/button'
import { turnHeadingDomId } from '@/features/conversations/transcript-turns'
import { formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'

/** The attempts the run did not end on: the ones a failover moved on from. */
function earlierAttempts(turn: Turn) {
    return turn.attempts.filter(
        (attempt) => attempt.attempt !== turn.shown_attempt,
    )
}

/**
 * The line over a turn: its number (the heading the page's links move focus to), when it started,
 * how it ended, what went wrong with it, and, for a run that moved on to another provider, a note
 * of its attempts that opens the earlier attempts' errors.
 */
export function TurnHeader({ turn, number }: { turn: Turn; number: number }) {
    const { trace } = turn
    const [open, setOpen] = useState(false)
    const detailsId = useId()
    const earlier = earlierAttempts(turn)

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <h3
                    id={turnHeadingDomId(trace.id)}
                    tabIndex={-1}
                    className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-caption text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                    #{formatCount(number)}
                </h3>
                <Timestamp
                    at={trace.started_at}
                    layout="inline"
                    className="text-caption text-muted-foreground"
                />
                <StatusBadge status={trace.status} tinted />
                {trace.issue_kind === null ? null : (
                    <IssueLabel
                        kind={trace.issue_kind}
                        className="text-xs text-muted-foreground"
                    />
                )}
                {turn.attempts.length > 1 ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        aria-expanded={open}
                        aria-controls={detailsId}
                        onClick={() => setOpen(!open)}
                        className="text-muted-foreground"
                    >
                        {formatCount(turn.attempts.length)} attempts
                        <ChevronDownIcon
                            aria-hidden="true"
                            className={cn(open && 'rotate-180')}
                        />
                    </Button>
                ) : null}
            </div>
            {open ? (
                <ul
                    id={detailsId}
                    aria-label="Earlier attempts"
                    className="flex flex-col gap-3 border-s ps-4"
                >
                    {earlier.map((attempt) => (
                        <li
                            key={attempt.attempt}
                            className="flex min-w-0 flex-col gap-2"
                        >
                            <p className="text-ui">
                                <span className="font-medium">
                                    Attempt {attempt.attempt}
                                </span>
                                {attempt.model === null &&
                                attempt.provider === null ? null : (
                                    <span className="ms-2 font-mono text-xs text-muted-foreground">
                                        {[attempt.provider, attempt.model]
                                            .filter((part) => part !== null)
                                            .join(' · ')}
                                    </span>
                                )}
                            </p>
                            <ErrorSummary
                                error={attempt.error}
                                issueKind={null}
                            />
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    )
}
