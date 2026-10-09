import { Notice } from '@/components/patterns/notice'
import { Button } from '@/components/ui/button'
import type { Refreshing } from '@/lib/refresh-policy'
import { cn } from '@/lib/utils'

type RefreshNoteProps = {
    /** Where the refreshing of the figures stands. */
    refreshing: Refreshing
    /** The last refresh failed, whatever is running. */
    failed: boolean
    onRetry: () => void
    className?: string
}

/**
 * Says so when the figures on screen could not be brought up to date: a quiet line while asking
 * goes on, a line with the way to try again when the last refresh failed and nothing will ask
 * again, and a notice with the way to try again once asking has stopped.
 * Nothing when there is nothing to say.
 */
export function RefreshNote({
    refreshing,
    failed,
    onRetry,
    className,
}: RefreshNoteProps) {
    if (refreshing === 'stopped') {
        return (
            <Notice
                tone="warning"
                title="Refreshing stopped after repeated failures."
                className={cn('mb-6', className)}
                action={
                    <Button variant="outline" size="sm" onClick={onRetry}>
                        Try again
                    </Button>
                }
            >
                What is shown is from before the failures.
            </Notice>
        )
    }

    if (!failed) {
        return null
    }

    const trying = refreshing === 'retrying'

    return (
        <div
            data-slot="refresh-note"
            className={cn(
                'mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground',
                className,
            )}
        >
            <p>
                {trying
                    ? 'The last refresh failed; trying again.'
                    : 'The last refresh failed. What is shown is from before it.'}
            </p>
            {/* Nothing asks again by itself unless the note says it is trying: then the way out is here. */}
            {trying ? null : (
                <Button variant="outline" size="xs" onClick={onRetry}>
                    Try again
                </Button>
            )}
        </div>
    )
}
