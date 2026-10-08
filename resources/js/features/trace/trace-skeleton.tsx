import { Skeleton } from '@/components/ui/skeleton'

/** Roughly the page's shape, while the run loads. */
export function TraceSkeleton() {
    return (
        <div
            role="status"
            aria-label="Loading run"
            data-slot="trace-skeleton"
            className="flex flex-col gap-6"
        >
            <div className="flex flex-col gap-3">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-96 max-w-full" />
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                {Array.from({ length: 5 }, (_, index) => (
                    <Skeleton key={index} className="h-10" />
                ))}
            </div>
            <div className="grid overflow-hidden rounded-lg border md:grid-cols-2">
                <div className="flex flex-col gap-2 p-4">
                    {Array.from({ length: 6 }, (_, index) => (
                        <Skeleton key={index} className="h-12" />
                    ))}
                </div>
                <Skeleton className="h-64 rounded-none" />
            </div>
        </div>
    )
}
