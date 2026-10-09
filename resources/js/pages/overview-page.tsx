import { PageHeader } from '@/components/patterns/page-header'
import { TimeRangeSelect } from '@/components/patterns/time-range-select'
import { AgentPerformance } from '@/features/agents'
import {
    ActivityPanel,
    AttentionPanel,
    OverviewMetrics,
} from '@/features/overview'
import { ModelsRanked } from '@/features/usage'
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
            {/* The chart takes the width beside the models of the range; what needs attention follows it, as its own panel. */}
            <div className="mt-6 flex flex-col gap-4">
                <ActivityPanel
                    aside={({ metric, leader }) => (
                        <ModelsRanked metric={metric} leader={leader} />
                    )}
                />
                <AttentionPanel />
                <AgentPerformance />
            </div>
        </>
    )
}
