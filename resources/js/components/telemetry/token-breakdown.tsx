import type { Usage } from '@/api/types'
import { formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'

type Row = {
    label: string
    count: number | null
    /** A part of the row above it, not an addition to it. */
    part?: boolean
    total?: boolean
}

type TokenBreakdownProps = {
    usage: Usage
    className?: string
}

/**
 * The tokens of one call, as the provider reported them: input and output, with the cache counts
 * shown as parts of the input and the reasoning count as part of the output, then the total. It
 * shows the API's numbers and adds nothing up. A count that was not reported says so, and while the
 * call is pending nothing is shown as a number.
 */
export function TokenBreakdown({ usage, className }: TokenBreakdownProps) {
    const rows: Row[] = [
        { label: 'Input', count: usage.input_tokens },
        { label: 'cache read', count: usage.cache_read_tokens, part: true },
        { label: 'cache write', count: usage.cache_write_tokens, part: true },
        { label: 'Output', count: usage.output_tokens },
        { label: 'reasoning', count: usage.reasoning_tokens, part: true },
        { label: 'Total', count: usage.total_tokens, total: true },
    ]

    return (
        <dl
            data-slot="token-breakdown"
            className={cn('flex flex-col gap-1 text-ui', className)}
        >
            {rows.map((row) => (
                <div
                    key={row.label}
                    className={cn(
                        'flex items-baseline justify-between gap-4',
                        row.part && 'ps-4 text-muted-foreground',
                        row.total && 'mt-1 border-t pt-1 font-medium',
                    )}
                >
                    <dt>{row.part ? `of which ${row.label}` : row.label}</dt>
                    <dd
                        className={cn(
                            'tabular-nums',
                            (usage.state === 'pending' || row.count === null) &&
                                'text-muted-foreground',
                        )}
                    >
                        {usage.state === 'pending'
                            ? 'Pending'
                            : row.count === null
                              ? 'Not reported'
                              : formatCount(row.count)}
                    </dd>
                </div>
            ))}
        </dl>
    )
}
