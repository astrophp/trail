import type { ReactNode } from 'react'
import { CountChip } from '@/components/patterns/count-chip'
import { Toggle } from '@/components/ui/toggle'
import { cn } from '@/lib/utils'

type ToggleFilterProps = {
    pressed: boolean
    onPressedChange: (pressed: boolean) => void
    /** The icon and the label. */
    children: ReactNode
    /** How many items the filter matches; nothing is shown while it is `undefined`. */
    count?: number
    className?: string
}

/** A filter that is either on or off. */
export function ToggleFilter({
    pressed,
    onPressedChange,
    children,
    count,
    className,
}: ToggleFilterProps) {
    return (
        <Toggle
            variant="outline"
            size="sm"
            pressed={pressed}
            onPressedChange={onPressedChange}
            data-slot="toggle-filter"
            className={cn(
                'h-7 gap-1.75 px-2 text-caption data-[state=on]:border-primary/40 data-[state=on]:bg-primary-soft data-[state=on]:text-primary-ink',
                className,
            )}
        >
            {children}
            <CountChip count={count} active={pressed} />
        </Toggle>
    )
}
