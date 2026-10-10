import { useParams } from 'react-router'
import { useMeta } from '@/features/meta'
import { TraceView, useTraceTitle } from '@/features/trace'
import { useBookmark } from '@/features/traces'

export function TracePage() {
    const { traceId = '' } = useParams()
    const bookmark = useBookmark(traceId)
    // Already fetched by the shell; the run page asks for nothing more.
    const staleAfter = useMeta().data?.data.stale_after

    // The breadcrumb and the browser tab are called after the run once it is loaded.
    useTraceTitle(traceId)

    return (
        <TraceView
            traceId={traceId}
            onBookmarkChange={bookmark}
            staleAfter={staleAfter}
        />
    )
}
