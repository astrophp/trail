/**
 * The route of a run's page, relative to the dashboard's base path, with a span selected when one
 * is given (the page's `span` parameter) and the page it was opened from (`from`, a path of the
 * dashboard with its query, which the page validates before it follows it). A run id is one path
 * segment, encoded here.
 */
export function tracePagePath(
    id: string,
    { span, from }: { span?: string | null; from?: string | null } = {},
): string {
    const query = new URLSearchParams()

    if (span !== undefined && span !== null && span !== '') {
        query.set('span', span)
    }

    if (from !== undefined && from !== null && from !== '') {
        query.set('from', from)
    }

    const text = query.toString()

    return `/traces/${encodeURIComponent(id)}${text === '' ? '' : `?${text}`}`
}
