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
 * goes on or the last refresh failed, and a notice with the way to try again once it has stopped.
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

    return (
        <p
            data-slot="refresh-note"
            className={cn('mb-3 text-caption text-muted-foreground', className)}
        >
            {refreshing === 'retrying'
                ? 'The last refresh failed; trying again.'
                : 'The last refresh failed. What is shown is from before it.'}
        </p>
    )
}
