import { useId, type ComponentProps, type ReactNode } from 'react'
import { RowLink } from '@/components/patterns/row-link'
import { cn } from '@/lib/utils'

type RankedListItemProps = {
    label: ReactNode
    /** The figure, drawn as given: the caller formats it. The bar is only a picture of it. */
    value: ReactNode
    /** This item's part of the whole, from 0 to 1. `null` when it is not known: no bar is drawn. */
    share: number | null
    /** Makes the label a link, and the whole item its target. */
    to?: ComponentProps<typeof RowLink>['to']
    /** A small line under the label. */
    detail?: ReactNode
    className?: string
}

/** One entry of a `RankedList`: a label, its value, and a thin bar for its share of the whole. */
export function RankedListItem({
    label,
    value,
    share,
    to,
    detail,
    className,
}: RankedListItemProps) {
    const labelId = useId()
    const valueId = useId()
    const fraction =
        share !== null && Number.isFinite(share)
            ? Math.min(1, Math.max(0, share))
            : null

    return (
        <li
            data-slot="ranked-list-item"
            className={cn(
                'relative flex flex-col gap-1 border-b py-3 first:pt-0 last:border-b-0 last:pb-0',
                className,
            )}
        >
            <div className="flex items-baseline justify-between gap-3 text-ui">
                <span id={labelId} className="min-w-0 wrap-anywhere">
                    {to === undefined ? (
                        label
                    ) : (
                        // Named by the value as well, so a list of links says what each one is worth.
                        <RowLink
                            to={to}
                            aria-labelledby={`${labelId} ${valueId}`}
                        >
                            {label}
                        </RowLink>
                    )}
                </span>
                <span id={valueId} className="shrink-0 tabular-nums">
                    {value}
                </span>
            </div>
            {detail ? (
                <div className="text-caption text-muted-foreground">
                    {detail}
                </div>
            ) : null}
            {fraction === null ? null : (
                <div
                    data-slot="ranked-list-bar"
                    aria-hidden="true"
                    className="mt-1 h-1.25 overflow-hidden rounded-sm bg-muted"
                >
                    <div
                        className="h-full rounded-sm bg-primary"
                        style={{ width: `${fraction * 100}%` }}
                    />
                </div>
            )}
        </li>
    )
}
