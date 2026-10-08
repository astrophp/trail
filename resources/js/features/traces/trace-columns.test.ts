import { describe, expect, it } from 'vitest'
import { traceSorts } from '@/api/traces'
import { traceColumns } from '@/features/traces/trace-columns'
import { toApiSort } from '@/lib/table-sort'

describe('trace columns', () => {
    const sortable = traceColumns.filter((column) => column.enableSorting)

    it('has the sortable columns the API can sort by', () => {
        expect(sortable.map((column) => column.id).sort()).toEqual([
            'agent',
            'cost',
            'duration',
            'started_at',
        ])
    })

    it.each(sortable.map((column) => String(column.id)))(
        'maps %s, both ways, to a value the API takes',
        (id) => {
            expect(traceSorts).toContain(
                toApiSort(traceSorts, { id, desc: false }),
            )
            expect(traceSorts).toContain(
                toApiSort(traceSorts, { id, desc: true }),
            )
        },
    )
})
