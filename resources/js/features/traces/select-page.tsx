import { useContext } from 'react'
import { SelectCheckbox } from '@/features/traces/select-checkbox'
import { TableBusyContext } from '@/components/patterns/table-busy'
import { SelectionContext } from '@/features/traces/selection-context'

/** The checkbox in the table's header: all the runs of the page on screen, or none. */
export function SelectPage() {
    const { ids, pageIds, togglePage } = useContext(SelectionContext)
    const busy = useContext(TableBusyContext)
    const selected = pageIds.filter((id) => ids.includes(id)).length

    return (
        <SelectCheckbox
            checked={pageIds.length > 0 && selected === pageIds.length}
            indeterminate={selected > 0 && selected < pageIds.length}
            label="Select all runs on this page"
            disabled={busy}
            onChange={togglePage}
        />
    )
}
