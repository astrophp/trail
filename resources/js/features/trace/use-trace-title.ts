import { usePageTitle } from '@/hooks/use-page-title'
import { shortId } from '@/lib/format'
import { useTrace } from '@/features/trace/use-trace'

/**
 * Names the page after the run once it is loaded ("SupportAssistant · 019a3f2c…b7e1"), for the
 * breadcrumb and the browser tab; until then the route's own title shows. It reads the same
 * query as the view, so it asks for nothing more.
 */
export function useTraceTitle(id: string): void {
    const trace = useTrace(id).data?.data.trace

    usePageTitle(trace ? `${trace.name} · ${shortId(trace.id)}` : null)
}
