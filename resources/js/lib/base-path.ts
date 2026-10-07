/** Normalise the dashboard base path handed over by the Blade layout. */
export function basePath(path: string | undefined): string {
    const trimmed = (path ?? '').replace(/^\/+|\/+$/g, '')

    return trimmed === '' ? '/' : `/${trimmed}`
}

/**
 * The base path as the browser reports it in `location.pathname`: each segment
 * percent-encoded, so a path with a space or a non-ASCII letter still matches.
 */
export function routerBasename(path: string): string {
    return path.split('/').map(encodeURIComponent).join('/')
}
