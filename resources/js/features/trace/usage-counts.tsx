import type { DirectUsage } from '@/api/types'
import { SearchUnitValue } from '@/components/telemetry/search-unit-value'
import { TokenCount } from '@/components/telemetry/token-count'
import { TableCell } from '@/components/ui/table'

/** The five counts of a usage table row, one cell each. */
export function UsageCounts({
    usage,
    showSearchUnits = false,
}: {
    usage: DirectUsage
    showSearchUnits?: boolean
}) {
    const pending = usage.state === 'pending'

    return (
        <>
            {[
                usage.input_tokens,
                usage.output_tokens,
                usage.cache_read_tokens,
                usage.cache_write_tokens,
                usage.reasoning_tokens,
            ].map((count, index) => (
                <TableCell key={index} className="text-end">
                    <TokenCount count={count} pending={pending} />
                </TableCell>
            ))}
            {showSearchUnits ? (
                <TableCell className="text-end">
                    <SearchUnitValue
                        count={usage.search_units}
                        pending={pending}
                    />
                </TableCell>
            ) : null}
        </>
    )
}
