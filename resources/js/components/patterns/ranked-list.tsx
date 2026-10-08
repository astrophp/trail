import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** A short list of `RankedListItem`s in the order they are given: a breakdown by model, tool or kind of failure. */
export function RankedList({ className, ...props }: ComponentProps<'ol'>) {
    return (
        <ol
            data-slot="ranked-list"
            className={cn('flex flex-col', className)}
            {...props}
        />
    )
}
