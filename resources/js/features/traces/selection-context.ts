import { createContext } from 'react'

/** The runs ticked in the list, and what can be done with them. */
export type TraceSelection = {
    /** The selected run ids, in the order they were selected. */
    ids: string[]
    /** The runs on the page on screen. */
    pageIds: string[]
    toggle: (id: string) => void
    /** Selects every run of the page, or clears them all when they are all selected already. */
    togglePage: () => void
    clear: () => void
}

const nothing = () => {}

export const SelectionContext = createContext<TraceSelection>({
    ids: [],
    pageIds: [],
    toggle: nothing,
    togglePage: nothing,
    clear: nothing,
})
