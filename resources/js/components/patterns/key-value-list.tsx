import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

const keyValueListVariants = cva('group/kvl', {
    variants: {
        layout: {
            /** Each label over its value, in a grid. */
            stack: 'grid gap-x-6 gap-y-3',
            /** One table: a label column and a value column, a hairline under every row. */
            rows: 'flex flex-col',
        },
        columns: {
            one: '',
            two: '',
        },
    },
    compoundVariants: [
        { layout: 'stack', columns: 'one', class: 'grid-cols-1' },
        /** Two columns from the `md` breakpoint; one below it. */
        {
            layout: 'stack',
            columns: 'two',
            class: 'grid-cols-1 md:grid-cols-2',
        },
    ],
    defaultVariants: { layout: 'stack', columns: 'one' },
})

type KeyValueListProps = ComponentProps<'dl'> &
    VariantProps<typeof keyValueListVariants>

/**
 * A description list of `KeyValue` rows: labels and their values, for metadata. The `rows` layout
 * is a two-column table (a muted label column and a value column) and ignores `columns`.
 */
export function KeyValueList({
    layout,
    columns,
    className,
    ...props
}: KeyValueListProps) {
    return (
        <dl
            data-slot="key-value-list"
            data-layout={layout ?? 'stack'}
            className={cn(keyValueListVariants({ layout, columns }), className)}
            {...props}
        />
    )
}
