import { traceSorts, type TraceSort } from '@/api/traces'
import type { DataTableSort } from '@/components/patterns/data-table'

/** The table's sort for the API's `sort` value: the column id is the field name. */
export function toTableSort(sort: TraceSort): DataTableSort {
    return sort.startsWith('-')
        ? { id: sort.slice(1), desc: true }
        : { id: sort, desc: false }
}

/**
 * The API's `sort` value for the table's sort. Only columns the API can sort by are
 * sortable, so any other id is a bug in the column definitions and throws.
 */
export function toApiSort({ id, desc }: DataTableSort): TraceSort {
    const sort = traceSorts.find((value) => value === (desc ? `-${id}` : id))

    if (sort === undefined) {
        throw new Error(`The API cannot sort traces by "${id}".`)
    }

    return sort
}
