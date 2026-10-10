import { PageHeader } from '@/components/patterns/page-header'
import { TimeRangeSelect } from '@/components/patterns/time-range-select'
import { UsageView } from '@/features/usage'
import { useTimeRange } from '@/hooks/use-time-range'

export function UsagePage() {
    const [range, setRange] = useTimeRange()

    return (
        <>
            <PageHeader
                title="Usage & cost"
                description="Token usage and estimated cost of recorded runs. Amounts are estimates from your configured prices, not provider invoices."
            >
                <TimeRangeSelect value={range} onValueChange={setRange} />
            </PageHeader>
            <UsageView className="mt-5.75 lg:mt-6.5" />
        </>
    )
}
