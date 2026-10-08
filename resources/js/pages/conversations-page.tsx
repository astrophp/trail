import { PageHeader } from '@/components/patterns/page-header'
import { TimeRangeSelect } from '@/components/patterns/time-range-select'
import { ConversationsView } from '@/features/conversations'
import { useMeta } from '@/features/meta'
import { useTimeRange } from '@/hooks/use-time-range'

export function ConversationsPage() {
    const [range, setRange] = useTimeRange()
    // What the filter offers: the agents seen in this range.
    const filters = useMeta().data?.data.filters

    return (
        <>
            <PageHeader
                title="Conversations"
                description="Understand the user's experience, one recorded turn at a time."
            >
                <TimeRangeSelect value={range} onValueChange={setRange} />
            </PageHeader>
            <ConversationsView
                agents={filters?.agents}
                className="mt-5.75 lg:mt-6.5"
            />
        </>
    )
}
