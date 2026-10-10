import { formatCount } from '@/lib/format'

type NounCountProps = {
    /** `null` or `undefined` when the count was not captured: shown as such, never as zero. */
    count: number | null | undefined
    singular: string
    plural: string
    className?: string
}

/** A count with its noun and thousands separators: `1 run`, `1,204 runs`. A count that is missing reads `Not captured`. */
export function NounCount({
    count,
    singular,
    plural,
    className,
}: NounCountProps) {
    if (count === null || count === undefined) {
        return (
            <span data-slot="noun-count" className={className}>
                Not captured
            </span>
        )
    }

    return (
        <span data-slot="noun-count" className={className}>
            {formatCount(count)} {count === 1 ? singular : plural}
        </span>
    )
}
