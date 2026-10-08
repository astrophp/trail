import { useContext } from 'react'
import type { Trace } from '@/api/types'
import { SelectCheckbox } from '@/features/traces/select-checkbox'
import { TableBusyContext } from '@/components/patterns/table-busy'
import { SelectionContext } from '@/features/traces/selection-context'
import { shortId } from '@/lib/format'

/** The checkbox of one run's row. */
export function SelectRow({ trace }: { trace: Trace }) {
    const { ids, toggle } = useContext(SelectionContext)
    const busy = useContext(TableBusyContext)

    return (
        <SelectCheckbox
            checked={ids.includes(trace.id)}
            label={`Select ${trace.name} ${shortId(trace.id)}`}
            disabled={busy}
            onChange={() => toggle(trace.id)}
        />
    )
}
