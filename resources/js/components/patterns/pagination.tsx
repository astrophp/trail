import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'

type PaginationProps = {
    /** The current page, counting from 1. */
    page: number
    perPage: number
    total: number
    lastPage: number
    onPageChange: (page: number) => void
    /** What is being paged through, in both numbers: `{ one: 'trace', other: 'traces' }`. */
    noun: { one: string; other: string }
    className?: string
}

/** Where the page is in the list, and the way to the page before and after it. */
export function Pagination({
    page,
    perPage,
    total,
    lastPage,
    onPageChange,
    noun,
    className,
}: PaginationProps) {
    // Whatever the caller passes, show and emit only pages that exist.
    const size = Math.max(perPage, 1)
    const last = Math.max(lastPage, 1)
    const current = Math.min(Math.max(page, 1), last)
    const first = (current - 1) * size + 1
    const through = Math.min(current * size, total)
    const word = total === 1 ? noun.one : noun.other

    let summary = `${formatCount(total)} ${word}`

    if (total > 0) {
        // One row on the page reads "5 of 5", not "5–5 of 5".
        const range =
            first === through
                ? formatCount(first)
                : `${formatCount(first)}–${formatCount(through)}`

        summary = `${range} of ${summary}`
    }

    const atStart = current <= 1
    const atEnd = current >= last

    return (
        <nav
            aria-label="Pagination"
            data-slot="pagination"
            className={cn(
                'flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-caption text-muted-foreground',
                className,
            )}
        >
            <p role="status">{summary}</p>
            <div className="flex items-center gap-1.5">
                <p className="mr-1.5">
                    Page {formatCount(current)} of {formatCount(last)}
                </p>
                {/* aria-disabled, not disabled: a button that disables itself drops keyboard focus. */}
                <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Previous page"
                    aria-disabled={atStart}
                    className="size-7.5 rounded-lg aria-disabled:pointer-events-none aria-disabled:opacity-50"
                    onClick={() => {
                        if (!atStart) {
                            onPageChange(current - 1)
                        }
                    }}
                >
                    <ChevronLeftIcon aria-hidden="true" />
                </Button>
                <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Next page"
                    aria-disabled={atEnd}
                    className="size-7.5 rounded-lg aria-disabled:pointer-events-none aria-disabled:opacity-50"
                    onClick={() => {
                        if (!atEnd) {
                            onPageChange(current + 1)
                        }
                    }}
                >
                    <ChevronRightIcon aria-hidden="true" />
                </Button>
            </div>
        </nav>
    )
}
