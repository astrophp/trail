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
 * The bookmark of a run, as a button: a faint outline when it is not bookmarked, a filled icon in
 * the primary colour when it is, so the shape and not the colour alone says which, and it doubles
 * as the marker. The outline is clearer on hover and on keyboard focus, and, inside a table row
 * (a `group/row`), while the row is hovered or has focus. Controlled: the caller saves the
 * change. The accessible name is constant ("Bookmark {name} {short id}") and `aria-pressed`
 * carries the state, so a screen reader never reads the name as the opposite of the state.
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
                'size-7 min-w-7 shrink-0 rounded-sm p-0 hover:bg-transparent aria-disabled:opacity-60 aria-pressed:bg-transparent data-[state=on]:bg-transparent',
                pressed
                    ? 'text-primary hover:text-primary'
                    : 'text-faint/80 group-focus-within/row:text-faint group-hover/row:text-faint hover:text-foreground focus-visible:text-foreground',
                className,
            )}
        >
            <BookmarkIcon
                aria-hidden="true"
                // The fill is an attribute, not a class: it is the shape cue, whatever the styles do.
                fill={pressed ? 'currentColor' : 'none'}
                className="size-4"
            />
        </Toggle>
    )
}
