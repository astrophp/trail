import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type RankedListSkeletonProps = {
    /** How many entries are on the way. */
    count?: number
    className?: string
}

/** The place of a `RankedList` while it loads. */
export function RankedListSkeleton({
    count = 3,
    className,
}: RankedListSkeletonProps) {
    return (
        <div
            data-slot="ranked-list-skeleton"
            aria-busy="true"
            className={cn('flex flex-col', className)}
        >
            <span className="sr-only">Loading</span>
            {Array.from({ length: count }, (_, index) => (
                <div
                    key={index}
                    aria-hidden="true"
                    className="flex flex-col gap-2 border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
                >
                    <div className="flex justify-between gap-3">
                        <Skeleton className="h-4 w-1/3" />
                        <Skeleton className="h-4 w-12" />
                    </div>
                    <Skeleton className="h-1.25 w-full" />
                </div>
            ))}
        </div>
    )
}
