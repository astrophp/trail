import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type PanelLoadingProps = {
    /** How many lines of placeholder to draw. */
    rows?: number
    className?: string
}

/** The content of a `Panel` while it loads. */
export function PanelLoading({ rows = 3, className }: PanelLoadingProps) {
    return (
        <div
            data-slot="panel-loading"
            aria-busy="true"
            className={cn('flex flex-col gap-3', className)}
        >
            <span className="sr-only">Loading</span>
            {Array.from({ length: rows }, (_, index) => (
                <Skeleton
                    key={index}
                    aria-hidden="true"
                    className="h-4 w-full"
                />
            ))}
        </div>
    )
}
