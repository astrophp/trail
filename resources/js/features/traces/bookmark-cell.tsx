import { useContext } from 'react'
import type { Trace } from '@/api/types'
import { TableBusyContext } from '@/components/patterns/table-busy'
import { BookmarkToggle } from '@/components/telemetry/bookmark-toggle'
import { useBookmark } from '@/features/traces/use-bookmark'

/**
 * The bookmark of a row, in the row's last cell (a `stickyEnd` column, so it is the cell the button
 * is laid over): at the far edge from the selection checkbox, so the two small controls are not
 * mistaken for one another. It does not write while the table shows
 * the previous view's rows.
 */
export function BookmarkCell({ trace }: { trace: Trace }) {
    const bookmark = useBookmark(trace.id)
    const busy = useContext(TableBusyContext)

    return (
        <>
            {/* Gives the cell its width in the flow; the button is laid over the whole cell. */}
            <span aria-hidden="true" className="block size-7" />
            <span className="absolute inset-0 flex">
                <BookmarkToggle
                    trace={trace}
                    onPressedChange={bookmark}
                    disabled={busy}
                    // The whole cell, padding included, is the target (a click on its padding
                    // would otherwise do nothing). The icon keeps its size and sits on the
                    // padding line, like the text above it; the focus ring stays inside the cell.
                    className="size-full min-w-0 justify-end rounded-none pr-4 focus-visible:ring-inset"
                />
            </span>
        </>
    )
}
