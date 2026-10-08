import { useParams } from 'react-router'
import { TraceView, useTraceTitle } from '@/features/trace'
import { useBookmark } from '@/features/traces'

export function TracePage() {
    const { traceId = '' } = useParams()
    const bookmark = useBookmark(traceId)

    // The breadcrumb and the browser tab are called after the run once it is loaded.
    useTraceTitle(traceId)

    return <TraceView traceId={traceId} onBookmarkChange={bookmark} />
}
