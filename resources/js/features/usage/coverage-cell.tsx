import type { UnitUsage, UsageRowCoverage } from '@/api/types'
import { formatCount } from '@/lib/format'

/**
 * How much of a row's usage could be priced, counted in steps. A row with nothing left out says
 * so quietly; one with steps that had no rate says how many of the steps that reported usage, and
 * how many tokens when that is known (it is not when those steps reported no count).
 */
export function CoverageCell({
    coverage,
    pending = false,
    units,
}: {
    coverage: UsageRowCoverage
    units?: UnitUsage
    /** A step of the row is still running, so "priced" holds only so far. */
    pending?: boolean
}) {
    const { reported_steps, unpriced_steps, unpriced_tokens } = coverage

    if (
        units &&
        ((units.unknown_cost_calls ?? 0) > 0 ||
            (units.incomplete_calls ?? 0) > 0 ||
            units.assessment !== 'assessed')
    ) {
        return (
            <div className="flex flex-col gap-1 text-caption text-muted-foreground">
                {units.assessment !== 'assessed' ? (
                    <span>
                        {units.assessment === 'partial'
                            ? 'Some history not assessed'
                            : 'Not assessed'}
                    </span>
                ) : null}
                {(units.unknown_cost_calls ?? 0) > 0 ? (
                    <span>
                        {formatCount(units.unknown_cost_calls ?? 0)}{' '}
                        {units.unknown_cost_calls === 1 ? 'call' : 'calls'}{' '}
                        without reported usage
                    </span>
                ) : null}
                {(units.incomplete_calls ?? 0) > 0 ? (
                    <span>
                        {formatCount(units.incomplete_calls ?? 0)} incomplete{' '}
                        {units.incomplete_calls === 1 ? 'call' : 'calls'}
                    </span>
                ) : null}
                {unpriced_steps > 0 ? (
                    <span>
                        {formatCount(unpriced_steps)} reported calls unpriced
                    </span>
                ) : null}
            </div>
        )
    }
    if (unpriced_steps > 0) {
        return (
            <div className="flex flex-col gap-1 leading-normal">
                <span>
                    {formatCount(unpriced_steps)} of{' '}
                    {formatCount(reported_steps)} calls unpriced
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
            {reported_steps === 0
                ? 'No usage reported'
                : pending
                  ? 'Priced so far'
                  : 'Priced'}
        </span>
    )
}
