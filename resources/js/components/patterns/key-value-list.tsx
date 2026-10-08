import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

const keyValueListVariants = cva('grid gap-x-6 gap-y-3', {
    variants: {
        columns: {
            one: 'grid-cols-1',
            /** Two columns from the `md` breakpoint; one below it. */
            two: 'grid-cols-1 md:grid-cols-2',
        },
    },
    defaultVariants: { columns: 'one' },
})

type KeyValueListProps = ComponentProps<'dl'> &
    VariantProps<typeof keyValueListVariants>

/** A description list of `KeyValue` rows: labels and their values, for metadata. */
export function KeyValueList({
    columns,
    className,
    ...props
}: KeyValueListProps) {
    return (
        <dl
            data-slot="key-value-list"
            className={cn(keyValueListVariants({ columns }), className)}
            {...props}
        />
    )
}
