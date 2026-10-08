import { useEffect, useRef, useState, type RefObject } from 'react'
import type { Status } from '@/api/types'
import type { SpanTree } from '@/features/trace/build-span-tree'
import {
    staleLink,
    staleLinkText,
    type StaleLink,
} from '@/features/trace/stale-link'
import type { traceParams } from '@/features/trace/trace-params'
import type { SetUrlState } from '@/hooks/use-url-state'

/**
 * Brings a run opened from a link to what the link showed. The selected span's row is scrolled
 * into view once (when the span the link names is not there yet on a running run, once it is).
 * A span or tab the link names that the run does not have is said once, as a message to dismiss,
 * and removed from the URL (replacing the entry), so a reload does not say it again.
 *
 * A run that is still running may simply not have recorded the span yet: until its status is
 * something else the URL is left as it is, the default selection shows for display only, and the
 * judgement is made on the first response that is not running. Call it where the run's state is
 * kept per run.
 */
export function useRestoredLink({
    tree,
    status,
    span,
    tab,
    truncated,
    selectedId,
    setParams,
    root,
}: {
    tree: SpanTree
    status: Status
    span: string
    tab: string
    /** The run has more spans than were returned. */
    truncated: boolean
    selectedId: string | null
    setParams: SetUrlState<typeof traceParams>
    /** The element that holds the span tree. */
    root: RefObject<HTMLElement | null>
}): { message: string | null; dismiss: () => void } {
    // `undefined` until the run has settled, then what the link got wrong, if anything.
    const [stale, setStale] = useState<StaleLink | null | undefined>(undefined)
    const [dismissed, setDismissed] = useState(false)
    const scrolled = useRef(false)
    const settled = status !== 'running'

    if (stale === undefined && settled) {
        setStale(staleLink(tree, status, span, tab))
    }

    useEffect(() => {
        if (stale) {
            setParams(stale.patch, { replace: true })
        }
    }, [stale, setParams])

    useEffect(() => {
        // The span the link names may still be recorded: wait for it.
        if (
            scrolled.current ||
            (!settled && span !== '' && selectedId !== span)
        ) {
            return
        }

        scrolled.current = true

        const rows =
            root.current?.querySelectorAll<HTMLElement>('[role="treeitem"]')

        Array.from(rows ?? [])
            .find((row) => row.dataset.spanId === selectedId)
            ?.scrollIntoView({ block: 'nearest' })
    }, [settled, span, selectedId, root])

    return {
        message: stale && !dismissed ? staleLinkText(stale, truncated) : null,
        dismiss: () => setDismissed(true),
    }
}
