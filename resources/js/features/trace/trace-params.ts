import { stringParam } from '@/lib/url-state'

/**
 * What the trace page keeps in the URL: the span that is selected, by id. Empty means the page
 * picks one itself (see `resolveSelection`).
 */
export const traceParams = {
    span: stringParam(),
}
