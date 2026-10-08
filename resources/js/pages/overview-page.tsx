import { PageHeader } from '@/components/patterns/page-header'
import { TimeRangeSelect } from '@/components/patterns/time-range-select'
import { OverviewMetrics } from '@/features/overview'
import { useTimeRange } from '@/hooks/use-time-range'

export function OverviewPage() {
    const [range, setRange] = useTimeRange()

    return (
        <>
            <PageHeader
                title="Overview"
                description="How your agents are doing, at a glance."
            >
                <TimeRangeSelect value={range} onValueChange={setRange} />
            </PageHeader>
            <OverviewMetrics className="mt-5.75 lg:mt-6.5" />
        </>
    )
}
