import { tabIds } from '@/features/trace/evidence-tabs'
import { enumParam, stringParam } from '@/lib/url-state'

/** The page's views, in the order of its tab bar. */
export const viewIds = ['execution', 'usage', 'metadata'] as const

export type ViewId = (typeof viewIds)[number]

/**
 * What the trace page keeps in the URL: the view, the span that is selected, by id, and the
 * evidence tab. The view is the execution tree unless the URL says otherwise. An empty span means
 * the page picks one itself (see `resolveSelection`); an empty tab means the span's first tab (see
 * `activeTab`). Changing the view leaves the span and the tab as they are.
 */
export const traceParams = {
    view: enumParam(viewIds, 'execution'),
    span: stringParam(),
    tab: enumParam(['', ...tabIds], ''),
}
