import { CompareView, canCompare, compareParams } from '@/features/compare'
import { useTrace } from '@/features/trace'
import { useUrlState } from '@/hooks/use-url-state'

/** Two runs from the URL, loaded as the run page loads them (a running one refreshes), side by side. */
export function ComparePage() {
    const [ids] = useUrlState(compareParams)
    const enabled = canCompare(ids.a, ids.b)
    const a = useTrace(ids.a, { enabled })
    const b = useTrace(ids.b, { enabled })

    return <CompareView ids={ids} runs={{ a, b }} />
}
