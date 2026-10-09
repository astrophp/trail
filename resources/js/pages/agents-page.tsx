import { PageHeader } from '@/components/patterns/page-header'
import { TimeRangeSelect } from '@/components/patterns/time-range-select'
import { AgentsList } from '@/features/agents'
import { useTimeRange } from '@/hooks/use-time-range'

export function AgentsPage() {
    const [range, setRange] = useTimeRange()

    return (
        <>
            <PageHeader
                title="Agents"
                description="Agents are discovered from recorded runs: how often each ran, how reliably, how fast and at what cost."
            >
                <TimeRangeSelect value={range} onValueChange={setRange} />
            </PageHeader>
            <AgentsList className="mt-5.75 lg:mt-6.5" />
        </>
    )
}
