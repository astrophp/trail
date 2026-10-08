import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type FlagLineProps = {
    icon: LucideIcon
    children: ReactNode
    /** The words of the button that shows the span; no button without `onShow`. */
    showLabel: string
    onShow: (() => void) | null
    className?: string
}

/** One quiet line about a flag of the run, with a button that shows the span it is about. */
export function FlagLine({
    icon: Icon,
    children,
    showLabel,
    onShow,
    className,
}: FlagLineProps) {
    return (
        <p
            data-slot="flag-line"
            className={cn(
                'flex flex-wrap items-center gap-x-2 text-ui text-muted-foreground',
                className,
            )}
        >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            <span>{children}</span>
            {onShow === null ? null : (
                <Button
                    variant="link"
                    size="xs"
                    className="h-auto px-0"
                    onClick={onShow}
                >
                    {showLabel}
                </Button>
            )}
        </p>
    )
}
