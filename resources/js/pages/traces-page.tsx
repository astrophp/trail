import { PageHeader } from '@/components/patterns/page-header'
import { TimeRangeSelect } from '@/components/patterns/time-range-select'
import { TracesTable } from '@/features/traces'
import { useTimeRange } from '@/hooks/use-time-range'

export function TracesPage() {
    const [range, setRange] = useTimeRange()

    return (
        <>
            <PageHeader
                title="Traces"
                description="Follow every run from prompt to response."
            >
                <TimeRangeSelect value={range} onValueChange={setRange} />
            </PageHeader>
            <TracesTable className="mt-5" />
        </>
    )
}
