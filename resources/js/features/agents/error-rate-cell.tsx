import type { AgentTopLevel } from '@/api/types'
import { RateValue } from '@/components/telemetry/rate-value'
import { formatCount } from '@/lib/format'

/**
 * The share of the agent's finished runs that failed, and under it how many failed when any did.
 * Incomplete runs are in the share's denominator and are not failures, so they are not shown here.
 */
export function ErrorRateCell({ own }: { own: AgentTopLevel }) {
    const { rate, failed } = own.error_rate

    return (
        <div className="flex flex-col items-end gap-1 leading-normal whitespace-normal xs:whitespace-nowrap">
            <RateValue rate={rate} />
            {failed > 0 ? (
                <span className="text-caption text-muted-foreground">
                    {formatCount(failed)} failed
                </span>
            ) : null}
        </div>
    )
}
