import { BookmarkIcon } from 'lucide-react'
import type { Trace } from '@/api/types'
import { Toggle } from '@/components/ui/toggle'
import { shortId } from '@/lib/format'
import { cn } from '@/lib/utils'

type BookmarkToggleProps = {
    trace: Pick<Trace, 'id' | 'name' | 'bookmarked'>
    onPressedChange: (bookmarked: boolean) => void
    /** Presses are ignored and the button says it is unavailable, but it stays focusable. */
    disabled?: boolean
    className?: string
}

/**
 * The bookmark of a run, as a button: an outline when it is not bookmarked, filled when it is, so
 * it doubles as the marker. Quiet (faint) when off, so it can always be shown. Controlled: the caller saves the change. The accessible name is
 * constant ("Bookmark {name} {short id}") and `aria-pressed` carries the state, so a screen reader
 * never reads the name as the opposite of the state.
 */
export function BookmarkToggle({
    trace,
    onPressedChange,
    disabled = false,
    className,
}: BookmarkToggleProps) {
    const pressed = trace.bookmarked

    return (
        <Toggle
            pressed={pressed}
            onPressedChange={(next) => {
                if (!disabled) {
                    onPressedChange(next)
                }
            }}
            aria-disabled={disabled || undefined}
            aria-label={`Bookmark ${trace.name} ${shortId(trace.id)}`}
            data-slot="bookmark-toggle"
            className={cn(
                'size-7 min-w-7 shrink-0 rounded-sm p-0 text-faint hover:bg-transparent hover:text-foreground aria-disabled:opacity-60 aria-pressed:bg-transparent data-[state=on]:bg-transparent data-[state=on]:text-primary-ink',
                className,
            )}
        >
            <BookmarkIcon
                aria-hidden="true"
                className={cn('size-4', pressed && 'fill-current')}
            />
        </Toggle>
    )
}
