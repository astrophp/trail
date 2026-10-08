import { Notice } from '@/components/patterns/notice'
import { Button } from '@/components/ui/button'
import type { Refreshing } from '@/lib/refresh-policy'
import { cn } from '@/lib/utils'

type RefreshNoteProps = {
    /** Where the refreshing of the running turns stands. */
    refreshing: Refreshing
    /** The last refresh failed, whatever is running. */
    failed: boolean
    onRetry: () => void
    className?: string
}

/**
 * Says whether the page keeps itself up to date, in the words the run's page uses: a quiet line
 * while running turns refresh by themselves or the last refresh failed, and a notice with the way
 * to try again once refreshing has stopped. Nothing when there is nothing to say.
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

    const words =
        refreshing === 'retrying'
            ? 'The last refresh failed; trying again.'
            : refreshing === 'polling'
              ? 'Running turns refresh by themselves.'
              : failed
                ? 'The last refresh failed. What is shown is from before it.'
                : null

    return words === null ? null : (
        <p
            data-slot="refresh-note"
            className={cn('mb-3 text-caption text-muted-foreground', className)}
        >
            {words}
        </p>
    )
}
