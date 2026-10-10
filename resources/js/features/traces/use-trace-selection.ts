import { useCallback, useMemo, useState } from 'react'
import type { TraceSelection } from '@/features/traces/selection-context'
import type { TimeRangePreset } from '@/lib/time-range'

/**
 * The runs ticked in the list. They are kept across pages, sorts and filters, for as long as the
 * list stays mounted, and let go of when the time range changes: the runs of another range are
 * not the ones that were picked.
 */
export function useTraceSelection(
    range: TimeRangePreset,
    pageIds: string[],
): TraceSelection {
    const [ids, setIds] = useState<string[]>([])
    const [selectedIn, setSelectedIn] = useState(range)

    if (range !== selectedIn) {
        setSelectedIn(range)
        setIds([])
    }

    const toggle = useCallback(
        (id: string) =>
            setIds((current) =>
                current.includes(id)
                    ? current.filter((other) => other !== id)
                    : [...current, id],
            ),
        [],
    )
    const togglePage = useCallback(
        () =>
            setIds((current) =>
                pageIds.every((id) => current.includes(id))
                    ? current.filter((id) => !pageIds.includes(id))
                    : [
                          ...current,
                          ...pageIds.filter((id) => !current.includes(id)),
                      ],
            ),
        [pageIds],
    )
    const clear = useCallback(() => setIds([]), [])

    return useMemo(
        () => ({ ids, pageIds, toggle, togglePage, clear }),
        [ids, pageIds, toggle, togglePage, clear],
    )
}
