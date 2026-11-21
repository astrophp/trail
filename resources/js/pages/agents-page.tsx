import { PageHeader } from '@/components/patterns/page-header'
import { TimeRangeSelect } from '@/components/patterns/time-range-select'
import { AgentsList } from '@/features/agents'
import { useTimeRange } from '@/hooks/use-time-range'

export function AgentsPage() {
    const [range, setRange] = useTimeRange()

    return (
        <>
            <PageHeader title="Agents">
                <TimeRangeSelect value={range} onValueChange={setRange} />
            </PageHeader>
            <AgentsList className="mt-5.75 lg:mt-6.5" />
        </>
    )
}
