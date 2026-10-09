import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type BusyRegionProps = {
    /** What is inside is the previous view's answer while the next loads. */
    busy: boolean
    /** What assistive technology is told while `busy`. */
    label?: string
    children: ReactNode
    className?: string
}

/**
 * A part of a page that keeps showing the previous view while the next loads: dimmed and
 * `aria-busy`, with the announcement in a status region that is always mounted (so a change of its
 * text is read out) and sits outside the dimmed part, where it cannot be muted.
 */
export function BusyRegion({
    busy,
    label = 'Loading',
    children,
    className,
}: BusyRegionProps) {
    return (
        <>
            <span role="status" className="sr-only">
                {busy ? label : ''}
            </span>
            <div
                data-slot="busy-region"
                aria-busy={busy || undefined}
                className={cn(
                    'motion-safe:transition-opacity',
                    busy && 'opacity-60',
                    className,
                )}
            >
                {children}
            </div>
        </>
    )
}
