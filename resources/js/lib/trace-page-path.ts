/**
 * The route of a run's page, relative to the dashboard's base path, with a span selected when one
 * is given (the page's `span` parameter). A run id is one path segment, encoded here.
 */
export function tracePagePath(
    id: string,
    { span }: { span?: string | null } = {},
): string {
    const query =
        span === undefined || span === null || span === ''
            ? ''
            : `?${new URLSearchParams({ span }).toString()}`

    return `/traces/${encodeURIComponent(id)}${query}`
}
