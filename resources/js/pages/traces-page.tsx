import { PageHeader } from '@/components/patterns/page-header'
import { TimeRangeSelect } from '@/components/patterns/time-range-select'
import { TracesView } from '@/features/traces'
import { useMeta } from '@/features/meta'
import { useTimeRange } from '@/hooks/use-time-range'

export function TracesPage() {
    const [range, setRange] = useTimeRange()
    // What the filters offer: the agents and providers seen in this range.
    const filters = useMeta().data?.data.filters

    return (
        <>
            <PageHeader
                title="Traces"
                description="Follow every run from prompt to response."
            >
                <TimeRangeSelect value={range} onValueChange={setRange} />
            </PageHeader>
            <TracesView
                agents={filters?.agents}
                providers={filters?.providers}
                className="mt-5.75 lg:mt-6.5"
            />
        </>
    )
}
