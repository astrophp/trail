import type { Usage } from '@/api/types'
import { TokenCount } from '@/components/telemetry/token-count'
import { TableCell } from '@/components/ui/table'

/** The five counts of a usage table row, one cell each. */
export function UsageCounts({ usage }: { usage: Usage }) {
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
        </>
    )
}
