import { createContext } from 'react'

/**
 * Whether the table is showing the previous view's rows while the next ones load. Those rows are
 * not the cached rows of the view being fetched, so a control that writes to the cache (the
 * bookmark) must not be used on them.
 */
export const TableBusyContext = createContext(false)
