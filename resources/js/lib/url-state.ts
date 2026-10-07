/**
 * View state that lives in the URL's query string. A param definition says how
 * one key is read and written; a value equal to its default is not written.
 */
export type Param<T> = {
    default: T
    /** The value for the text in the URL, or `undefined` when it is not valid. */
    parse(raw: string): T | undefined
    serialize(value: T): string
}

export type Params = Record<string, Param<unknown>>

export type State<P extends Params> = {
    [K in keyof P]: P[K] extends Param<infer T> ? T : never
}

export function stringParam(fallback = ''): Param<string> {
    return { default: fallback, parse: (raw) => raw, serialize: String }
}

export function intParam(
    fallback: number,
    { min }: { min?: number } = {},
): Param<number> {
    return {
        default: fallback,
        parse: (raw) => {
            const value = Number(raw)

            return /^-?\d+$/.test(raw) && (min === undefined || value >= min)
                ? value
                : undefined
        },
        serialize: String,
    }
}

/** Present as `1` when on; absent when off. */
export function boolParam(): Param<boolean> {
    return {
        default: false,
        parse: (raw) => (raw === '1' ? true : undefined),
        serialize: (value) => (value ? '1' : '0'),
    }
}

export function enumParam<const V extends readonly string[]>(
    values: V,
    fallback: V[number],
): Param<V[number]> {
    return {
        default: fallback,
        parse: (raw) => values.find((value) => value === raw),
        serialize: String,
    }
}

/** What the URL says, with the default for a key that is missing or invalid. */
export function readState<P extends Params>(
    params: P,
    search: URLSearchParams,
): State<P> {
    const state: Record<string, unknown> = {}

    for (const [key, param] of Object.entries(params)) {
        const raw = search.get(key)

        state[key] =
            (raw === null ? undefined : param.parse(raw)) ?? param.default
    }

    return state as State<P>
}

/**
 * The query string after applying `patch` to what `search` currently says. Params
 * not in `params` stay where they were; the others follow, in the order of `params`,
 * and are left out when equal to their default. An invalid value that was not
 * patched is dropped.
 */
export function writeState<P extends Params>(
    params: P,
    search: URLSearchParams,
    patch: Partial<State<P>>,
): URLSearchParams {
    const next = readState(params, search) as Record<string, unknown>
    Object.assign(next, patch)

    const result = new URLSearchParams()

    for (const [key, value] of search) {
        if (!Object.hasOwn(params, key)) {
            result.append(key, value)
        }
    }

    for (const [key, param] of Object.entries(params)) {
        const text = param.serialize(next[key])

        if (text !== param.serialize(param.default)) {
            result.set(key, text)
        }
    }

    return result
}
