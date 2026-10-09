import type { ReactNode } from 'react'
import { MetricStrip } from '@/components/patterns/metric-strip'
import { CostMetric } from '@/components/telemetry/cost-metric'
import { DurationMetric } from '@/components/telemetry/duration-metric'
import { ErrorRateMetric } from '@/components/telemetry/error-rate-metric'
import type { MetricProps } from '@/components/telemetry/metric-props'
import { TracesMetric } from '@/components/telemetry/traces-metric'

type SummaryStripProps = MetricProps & {
    /** Under the count of traces, such as how many of the runs were delegated. */
    tracesDetail?: ReactNode
    className?: string
}

/**
 * The four figures of a summary: traces, error rate, p95 duration (the average while there are
 * too few measured runs for a percentile) and estimated cost, each against the previous period and
 * linked to the runs behind it. It draws what it is given: the page owns the states around it and
 * says which range the summary answers for.
 */
export function SummaryStrip({
    tracesDetail,
    className,
    ...metric
}: SummaryStripProps) {
    return (
        <MetricStrip className={className}>
            <TracesMetric {...metric} detail={tracesDetail} />
            <ErrorRateMetric {...metric} />
            <DurationMetric {...metric} />
            <CostMetric {...metric} />
        </MetricStrip>
    )
}
