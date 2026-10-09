import { useContext } from 'react'
import type { Trace } from '@/api/types'
import { TableBusyContext } from '@/components/patterns/table-busy'
import { BookmarkToggle } from '@/components/telemetry/bookmark-toggle'
import { useBookmark } from '@/features/traces/use-bookmark'

/**
 * The bookmark of a row, in the row's last cell: at the far edge from the selection checkbox, so
 * the two small controls are not mistaken for one another. It does not write while the table shows
 * the previous view's rows.
 */
export function BookmarkCell({ trace }: { trace: Trace }) {
    const bookmark = useBookmark(trace.id)
    const busy = useContext(TableBusyContext)

    return (
        <BookmarkToggle
            trace={trace}
            onPressedChange={bookmark}
            disabled={busy}
            // The icon's own edge sits on the cell's padding, like the right-aligned text beside
            // it; the hit area overflows the row's lines instead of stretching them.
            className="-my-1 -mr-1.5"
        />
    )
}
