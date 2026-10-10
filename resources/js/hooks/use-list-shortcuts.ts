import type { RefObject } from 'react'
import { useShortcuts } from '@/hooks/use-shortcuts'
import { ariaKeyShortcuts } from '@/lib/shortcuts'

type ListShortcutsOptions = {
    /** The `DataTable`'s root element, which holds the rows. */
    table: RefObject<HTMLElement | null>
    /** The page's search field. Leave it out for a list that has none: `/` then does nothing. */
    search?: RefObject<HTMLInputElement | null>
    /**
     * The page of the rows on screen and the last one, with the way to another. Leave it out
     * while they are not known (loading); the paging keys then do nothing.
     */
    pages?: { page: number; last: number; go: (page: number) => void }
}

/** The keys of the paging buttons, for `Pagination`'s `shortcuts`: what its buttons tell assistive technology. */
export function pageShortcuts() {
    return {
        previous: ariaKeyShortcuts('page-previous'),
        next: ariaKeyShortcuts('page-next'),
    }
}

/** The link of each row that leads somewhere: what a key moves focus to, and Enter opens. */
const rowLinks = 'tbody [data-slot="row-link"]'

/**
 * The shortcuts of a list page: `/` focuses the search field, `j` and `k` move focus to the next
 * and previous row, `]` and `[` go to the next and previous page.
 *
 * A row is reached by focusing its own link, so Enter, a screen reader and the focus ring are the
 * ones of any link. A row that has no link is passed over. With no row focused, `j` goes to the
 * first row and `k` does nothing; at the first and last row the key does nothing (the list does
 * not wrap, and does not turn the page). Focus inside a row (its checkbox, its bookmark) counts
 * as being on that row.
 *
 * While the table is busy (the previous view's rows are shown, or the first load is on) the row
 * and paging keys do nothing: those rows and that page count answer for a view that is gone.
 */
export function useListShortcuts({
    table,
    search,
    pages,
}: ListShortcutsOptions): void {
    function busy() {
        return (
            table.current === null ||
            table.current.querySelector('[aria-busy="true"]') !== null
        )
    }

    function step(by: 1 | -1) {
        if (busy()) {
            return
        }

        const links = [
            ...(table.current?.querySelectorAll<HTMLElement>(rowLinks) ?? []),
        ]
        const row =
            document.activeElement instanceof Element
                ? document.activeElement.closest('tbody tr')
                : null
        const at = links.findIndex((link) => link.closest('tr') === row)
        const target =
            row === null || at === -1
                ? by === 1
                    ? links[0]
                    : undefined
                : links[at + by]

        if (target !== undefined) {
            target.focus({ preventScroll: true })
            // Whatever the sticky bar covers, the row is brought fully into view.
            target.scrollIntoView({ block: 'nearest' })
        }
    }

    function turn(by: 1 | -1) {
        if (
            busy() ||
            pages === undefined ||
            pages.page + by < 1 ||
            pages.page + by > pages.last
        ) {
            return
        }

        pages.go(pages.page + by)
    }

    useShortcuts({
        search:
            search === undefined
                ? undefined
                : () => {
                      search.current?.focus()
                      search.current?.select()
                  },
        'row-next': () => step(1),
        'row-previous': () => step(-1),
        'page-next': pages === undefined ? undefined : () => turn(1),
        'page-previous': pages === undefined ? undefined : () => turn(-1),
    })
}
