import { ChevronRightIcon } from 'lucide-react'
import { toggleSlot } from '@/features/trace/row-layout'
import { cn } from '@/lib/utils'

type RowToggleProps = {
    /** `undefined` for a row without anything under it: an empty space of the chevron's size. */
    expanded: boolean | undefined
    /** For such a row under a parent: a small corner that ties it to the row above, like a tree's. */
    connector?: boolean
}

/** The disclosure chevron of a row of the execution tree. The row itself carries `aria-expanded`. */
export function RowToggle({ expanded, connector = false }: RowToggleProps) {
    return (
        <span
            data-slot={toggleSlot}
            aria-hidden="true"
            className={cn(
                'flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground',
                expanded !== undefined && 'hover:bg-muted',
            )}
        >
            {expanded === undefined ? (
                connector ? (
                    <span className="ms-1.5 mb-1.5 h-2.5 w-2 rounded-es-sm border-s border-b border-muted-foreground/40" />
                ) : null
            ) : (
                <ChevronRightIcon
                    className={cn(
                        'size-3 transition-transform',
                        expanded && 'rotate-90',
                    )}
                />
            )}
        </span>
    )
}
