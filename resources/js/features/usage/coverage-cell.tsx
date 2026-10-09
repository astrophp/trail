import type { UsageRowCoverage } from '@/api/types'
import { formatCount } from '@/lib/format'

/**
 * How much of a row's usage could be priced, counted in steps. A row with nothing left out says
 * so quietly; one with steps that had no rate says how many of the steps that reported usage, and
 * how many tokens when that is known (it is not when those steps reported no count).
 */
export function CoverageCell({ coverage }: { coverage: UsageRowCoverage }) {
    const { reported_steps, unpriced_steps, unpriced_tokens } = coverage

    if (unpriced_steps > 0) {
        return (
            <div className="flex flex-col gap-1 leading-normal">
                <span>
                    {formatCount(unpriced_steps)} of{' '}
                    {formatCount(reported_steps)} steps unpriced
                </span>
                {unpriced_tokens === null ? null : (
                    <span className="text-caption text-muted-foreground">
                        {formatCount(unpriced_tokens)}{' '}
                        {unpriced_tokens === 1 ? 'token' : 'tokens'}
                    </span>
                )}
            </div>
        )
    }

    return (
        <span className="text-muted-foreground">
            {reported_steps === 0 ? 'No usage reported' : 'Priced'}
        </span>
    )
}
