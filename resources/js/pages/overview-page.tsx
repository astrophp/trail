import { PageHeader } from '@/components/patterns/page-header'
import { TimeRangeSelect } from '@/components/patterns/time-range-select'
import {
    ActivityPanel,
    AttentionPanel,
    OverviewMetrics,
} from '@/features/overview'
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
            {/* Side by side from 42rem of the page's own width, whatever the viewport: three fifths and two fifths, and two thirds and one third from 64rem. */}
            <div className="@container mt-6">
                <div className="grid gap-4 @2xl:grid-cols-5 @5xl:grid-cols-3">
                    <ActivityPanel className="@2xl:col-span-3 @5xl:col-span-2" />
                    <AttentionPanel className="@2xl:col-span-2 @2xl:col-start-4 @5xl:col-span-1 @5xl:col-start-3" />
                </div>
            </div>
        </>
    )
}
