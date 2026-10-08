import { usePageTitle } from '@/hooks/use-page-title'
import { shortId } from '@/lib/format'
import { isNotFound, useTrace } from '@/features/trace/use-trace'

/**
 * Names the page after the run once it is loaded ("SupportAssistant · 019a3f2c…b7e1"), for the
 * breadcrumb and the browser tab; until then the route's own title shows, and it shows again when
 * the run turns out to be gone, though its data is still cached. It reads the same query as the
 * view, so it asks for nothing more.
 */
export function useTraceTitle(id: string): void {
    const { data, error } = useTrace(id, { refresh: false })
    const trace = isNotFound(error) ? undefined : data?.data.trace

    usePageTitle(trace ? `${trace.name} · ${shortId(trace.id)}` : null)
}
