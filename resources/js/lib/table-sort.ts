/** A table's sort: the column's id, and the direction. The same shape as `DataTableSort`. */
export type TableSort = { id: string; desc: boolean }

/** The table's sort for an API `sort` value: the column id is the field name, `-` means descending. */
export function toTableSort(sort: string): TableSort {
    return sort.startsWith('-')
        ? { id: sort.slice(1), desc: true }
        : { id: sort, desc: false }
}

/**
 * The API's `sort` value for the table's sort, out of the `sorts` it takes. Only columns the API
 * can sort by are sortable, so any other id is a bug in the column definitions and throws.
 */
export function toApiSort<const S extends readonly string[]>(
    sorts: S,
    { id, desc }: TableSort,
): S[number] {
    const sort = sorts.find((value) => value === (desc ? `-${id}` : id))

    if (sort === undefined) {
        throw new Error(`The API cannot sort by "${id}".`)
    }

    return sort
}
