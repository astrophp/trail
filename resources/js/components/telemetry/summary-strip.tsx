import type { ReactNode } from 'react'
import { MetricStrip } from '@/components/patterns/metric-strip'
import { CostMetric } from '@/components/telemetry/cost-metric'
import { DurationMetric } from '@/components/telemetry/duration-metric'
import { ErrorRateMetric } from '@/components/telemetry/error-rate-metric'
import type { MetricProps } from '@/components/telemetry/metric-props'
import { TracesMetric } from '@/components/telemetry/traces-metric'
import { timeRangePeriods } from '@/lib/time-range'

type SummaryStripProps = MetricProps & {
    /** Under the count of traces, such as how many of the runs were delegated. */
    tracesDetail?: ReactNode
    className?: string
}

/**
 * The four figures of a summary: traces, error rate, p95 duration (the average while there are
 * too few measured runs for a percentile) and estimated cost, each against the previous period and
 * linked to the runs behind it, and a line saying so when the previous period holds no runs to
 * compare with. It draws what it is given: the page owns the states around it and
 * says which range the summary answers for.
 */
export function SummaryStrip({
    tracesDetail,
    className,
    ...metric
}: SummaryStripProps) {
    return (
        <>
            <MetricStrip className={className}>
                <TracesMetric {...metric} detail={tracesDetail} />
                <ErrorRateMetric {...metric} />
                <DurationMetric {...metric} />
                <CostMetric {...metric} />
            </MetricStrip>
            {metric.previous === null ? (
                <p
                    data-slot="no-previous-runs"
                    className="mt-3 text-caption text-muted-foreground"
                >
                    No runs were recorded in the previous{' '}
                    {timeRangePeriods[metric.range]}
                </p>
            ) : null}
        </>
    )
}
