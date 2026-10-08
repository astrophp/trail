// JSON as the server decoded it from a stored payload. Its shape is the agent's, not Trail's.

export type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonValue[]
    | { [key: string]: JsonValue }

export type JsonObject = { [key: string]: JsonValue }

/** An array or an object: a value that has children. */
export function isContainer(
    value: JsonValue,
): value is JsonValue[] | JsonObject {
    return typeof value === 'object' && value !== null
}

/** How many characters of a top-level string are put in the page at a time. */
export const textChunk = 4000

/** How many characters of a string inside a tree are put in the page at a time. */
export const leafTextChunk = 500

/** How many children of a container are put in the page at a time. */
export const childChunk = 100

/** Containers nested this deep or deeper start collapsed. The top level is depth 0. */
export const openDepth = 2

/** A container below the top level with more children than this starts collapsed, however shallow. */
export const wideContainer = 20

/** An object key longer than this is cut, with its full text left to a tooltip. */
export const keyLimit = 200

/**
 * The first `limit` children of a container as `[key, value]` pairs (array indexes are the keys),
 * and how many it has in all. The rest is counted, never copied.
 */
export function entriesOf(
    value: JsonValue[] | JsonObject,
    limit: number,
): { entries: [string, JsonValue][]; total: number } {
    if (Array.isArray(value)) {
        return {
            entries: value
                .slice(0, limit)
                .map((item, index) => [String(index), item]),
            total: value.length,
        }
    }

    const entries: [string, JsonValue][] = []
    let total = 0

    for (const key in value) {
        if (!Object.hasOwn(value, key)) {
            continue
        }

        if (entries.length < limit) {
            entries.push([key, value[key]])
        }

        total++
    }

    return { entries, total }
}

/**
 * Where to cut `text` when about `length` characters are wanted: never inside a surrogate pair,
 * and never inside an occurrence of `marker`. The result is at least `length`.
 */
export function cutPoint(text: string, length: number, marker: string): number {
    if (length >= text.length) {
        return text.length
    }

    const code = text.charCodeAt(length - 1)
    let end = code >= 0xd800 && code <= 0xdbff ? length + 1 : length

    if (marker !== '' && end < text.length) {
        const from = Math.max(0, end - marker.length + 1)
        const found = text.slice(from, end + marker.length - 1).indexOf(marker)

        if (found !== -1) {
            end = from + found + marker.length
        }
    }

    return Math.min(end, text.length)
}

/** The value written out with two-space indentation: the only formatting a payload ever gets. */
export function prettyJson(value: JsonValue): string {
    return JSON.stringify(value, null, 2)
}

export type TextPart = { text: string; marker: boolean }

/** Cuts `text` at every occurrence of `marker`, keeping the markers as parts of their own. */
export function splitOnMarker(text: string, marker: string): TextPart[] {
    if (marker === '' || !text.includes(marker)) {
        return [{ text, marker: false }]
    }

    const parts: TextPart[] = []

    text.split(marker).forEach((piece, index) => {
        if (index > 0) {
            parts.push({ text: marker, marker: true })
        }

        if (piece !== '') {
            parts.push({ text: piece, marker: false })
        }
    })

    return parts
}

/**
 * Whether two stored values are the same JSON: strings, numbers, booleans and null by value,
 * arrays element by element, objects key by key in any order. A key whose value is `undefined`
 * cannot occur in decoded JSON and is not treated as absent.
 */
export function jsonEqual(
    a: JsonValue | undefined,
    b: JsonValue | undefined,
): boolean {
    if (a === b) {
        return true
    }

    if (
        a === undefined ||
        b === undefined ||
        a === null ||
        b === null ||
        typeof a !== 'object' ||
        typeof b !== 'object'
    ) {
        return false
    }

    if (Array.isArray(a) || Array.isArray(b)) {
        return (
            Array.isArray(a) &&
            Array.isArray(b) &&
            a.length === b.length &&
            a.every((item, index) => jsonEqual(item, b[index]))
        )
    }

    const keys = Object.keys(a)

    return (
        keys.length === Object.keys(b).length &&
        keys.every((key) => Object.hasOwn(b, key) && jsonEqual(a[key], b[key]))
    )
}
