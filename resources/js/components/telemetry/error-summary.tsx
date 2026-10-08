import type { ErrorSource, IssueKind, TraceError } from '@/api/types'
import { IssueLabel } from '@/components/telemetry/issue-label'
import { cn } from '@/lib/utils'

const sources: Record<ErrorSource, string> = {
    step: 'Raised by a model step',
    tool: 'Raised by a tool',
    run: 'Raised by the run',
}

type ErrorSummaryProps = {
    error: TraceError | null
    issueKind: IssueKind | null
    className?: string
}

/** How a run or a span failed, in one block. A part that was not recorded is left out, not shown as a placeholder. */
export function ErrorSummary({
    error,
    issueKind,
    className,
}: ErrorSummaryProps) {
    const source = error?.source != null ? sources[error.source] : undefined
    const recorded =
        error !== null &&
        (error.class !== null ||
            error.http_status !== null ||
            source !== undefined ||
            error.message !== null)

    // Nothing to say: no red box for an empty error.
    if (issueKind === null && !recorded) {
        return null
    }

    return (
        <div
            data-slot="error-summary"
            role="group"
            aria-label="Error"
            className={cn(
                'flex flex-col gap-1.5 rounded-md border border-destructive/30 bg-destructive-soft p-3 text-ui',
                className,
            )}
        >
            {issueKind !== null ? (
                <IssueLabel
                    kind={issueKind}
                    className="font-medium text-destructive"
                />
            ) : null}
            {error === null ? (
                <p className="text-muted-foreground">No error was recorded.</p>
            ) : (
                <>
                    {error.class !== null || error.http_status !== null ? (
                        <p className="flex flex-wrap items-baseline gap-x-2">
                            {error.class !== null ? (
                                <span className="font-mono text-xs break-all">
                                    {error.class}
                                </span>
                            ) : null}
                            {error.http_status !== null ? (
                                <span className="tabular-nums">
                                    HTTP {error.http_status}
                                </span>
                            ) : null}
                        </p>
                    ) : null}
                    {source !== undefined ? (
                        <p className="text-caption text-muted-foreground">
                            {source}
                        </p>
                    ) : null}
                    {error.message !== null ? (
                        <p className="break-words whitespace-pre-wrap">
                            {error.message}
                        </p>
                    ) : null}
                </>
            )}
        </div>
    )
}
