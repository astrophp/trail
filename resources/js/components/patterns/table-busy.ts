import { createContext } from 'react'

/**
 * Whether the table is showing the previous view's rows while the next ones load. `DataTable`
 * provides it from its `busy` prop. Those rows are not the cached rows of the view being
 * fetched, so a control in a cell that writes to the cache (a bookmark) must not be used on them.
 */
export const TableBusyContext = createContext(false)
