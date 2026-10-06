/** Normalise the dashboard base path handed over by the Blade layout. */
export function basePath(path: string | undefined): string {
    const trimmed = (path ?? '').replace(/^\/+|\/+$/g, '')

    return trimmed === '' ? '/' : `/${trimmed}`
}
