import { Skeleton } from '@/components/ui/skeleton'

/** Roughly the page's shape, while the conversation loads: the side column, then turns. */
export function TranscriptSkeleton() {
    return (
        <div
            role="status"
            aria-label="Loading conversation"
            data-slot="transcript-skeleton"
            className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-10"
        >
            <div className="flex flex-col gap-3 lg:order-last lg:w-64">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10" />
                <Skeleton className="h-40" />
            </div>
            <div className="flex min-w-0 flex-col gap-8">
                {Array.from({ length: 2 }, (_, index) => (
                    <div key={index} className="flex flex-col gap-4">
                        <Skeleton className="h-5 w-56" />
                        <Skeleton className="h-14 w-3/4" />
                        <Skeleton className="h-24" />
                    </div>
                ))}
            </div>
        </div>
    )
}
