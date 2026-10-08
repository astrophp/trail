import { tabIds } from '@/features/trace/evidence-tabs'
import { enumParam, stringParam } from '@/lib/url-state'

/**
 * What the trace page keeps in the URL: the span that is selected, by id, and the evidence tab.
 * An empty span means the page picks one itself (see `resolveSelection`); an empty tab means the
 * span's first tab (see `activeTab`).
 */
export const traceParams = {
    span: stringParam(),
    tab: enumParam(['', ...tabIds], ''),
}
