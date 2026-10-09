/**
 * The longest value of a `from` parameter that is read: far past any list view's query, and past
 * a 255-character conversation id of four-byte characters once it is percent-encoded.
 */
const maxLength = 4096

/** Where a detail page was opened from: a path inside the dashboard and its query. */
export type ReturnTarget = {
    /** Relative to the dashboard's base path, like the router's own pathnames. */
    pathname: string
    /** Empty, or the query string with its `?`. */
    search: string
}

/**
 * The value of a `from` parameter for the page at `pathname` and `search` (both relative to the
 * dashboard's base path, as the router reports them): the path with its query. A `from` of the
 * page's own is left out, so a return target never holds another one.
 */
export function returnTo(pathname: string, search: string): string {
    const params = new URLSearchParams(search)

    if (params.has('from')) {
        params.delete('from')
        search = params.toString()
    }

    return `${pathname}${search === '' || search.startsWith('?') ? search : `?${search}`}`
}

/** Whether `pathname` is `pattern`: the same segments, a `:name` segment standing for any one. */
function matches(pattern: string, pathname: string): boolean {
    const wanted = pattern.split('/')
    const actual = pathname.split('/')

    return (
        wanted.length === actual.length &&
        wanted.every((segment, index) =>
            segment.startsWith(':')
                ? actual[index] !== ''
                : segment === actual[index],
        )
    )
}

/** Whitespace of any kind, a backslash, or a control character: nothing a path of ours holds. */
function forbidden(value: string): boolean {
    return (
        /[\s\\]/.test(value) ||
        Array.from(value).some((char) => {
            const code = char.codePointAt(0) ?? 0

            return code < 0x20 || (code >= 0x7f && code <= 0x9f)
        })
    )
}

/**
 * The page a `from` value points back to, or `null` when it is anything but a path inside the
 * dashboard that one of `allowed` (path patterns such as `/traces` or `/traces/:traceId`) serves.
 * The value comes from the address bar, so it is never trusted: it must start with exactly one
 * `/`, hold no whitespace, control character or backslash, no more than `maxLength` characters,
 * and read back as itself once parsed (so `..` segments, a fragment or a host cannot hide in it).
 */
export function parseReturn(
    value: string | null | undefined,
    allowed: readonly string[],
): ReturnTarget | null {
    if (
        typeof value !== 'string' ||
        value.length > maxLength ||
        !/^\/(?![/\\])/.test(value) ||
        forbidden(value)
    ) {
        return null
    }

    let url: URL

    try {
        url = new URL(value, 'http://x')
    } catch {
        return null
    }

    if (
        url.origin !== 'http://x' ||
        url.hash !== '' ||
        url.searchParams.has('from') ||
        `${url.pathname}${url.search}` !== value ||
        !allowed.some((pattern) => matches(pattern, url.pathname))
    ) {
        return null
    }

    return { pathname: url.pathname, search: url.search }
}
