import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** A short list of `RankedListItem`s in the order they are given: a breakdown by model, tool or kind of failure. */
export function RankedList({ className, ...props }: ComponentProps<'ol'>) {
    return (
        // Safari drops the list semantics of a list whose markers a reset removes.
        // eslint-disable-next-line jsx-a11y/no-redundant-roles
        <ol
            role="list"
            data-slot="ranked-list"
            className={cn('flex flex-col', className)}
            {...props}
        />
    )
}
