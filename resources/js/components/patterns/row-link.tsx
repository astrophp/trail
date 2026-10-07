import { Link } from 'react-router'
import { cn } from '@/lib/utils'

/**
 * The link of a row that leads somewhere, for one of its cells. It is a real link, so Tab,
 * Enter, middle-click and "open in new tab" work, and a stretched pseudo-element makes the
 * whole row its target (the row of a `DataTable` is `relative`).
 *
 * `DataTable` lifts the other links and buttons of a cell above the stretched area by itself.
 * On narrow screens, where the first column sticks, a link in that column covers its own
 * cell only: a sticky cell is the containing block of its pseudo-element.
 */
export function RowLink({
    className,
    ...props
}: React.ComponentProps<typeof Link>) {
    return (
        <Link
            data-slot="row-link"
            className={cn(
                'rounded-sm font-medium text-foreground outline-none after:absolute after:inset-0 hover:text-primary-ink hover:underline focus-visible:after:ring-3 focus-visible:after:ring-ring/50 focus-visible:after:ring-inset',
                className,
            )}
            {...props}
        />
    )
}
