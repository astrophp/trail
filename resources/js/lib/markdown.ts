// Helpers for showing a model's answer as markdown. Nothing here renders; the components that do
// are `patterns/markdown` and `patterns/markdown-text`.

import { cutPoint } from '@/lib/json'

/** The schemes a link may use. Anything else is shown as text and never followed. */
const safeSchemes = ['http:', 'https:', 'mailto:']

/**
 * The URL when a link may point at it, or `null`. Relative URLs and fragments are allowed; a URL
 * with any scheme but http, https or mailto is not, however it is written (case, whitespace or
 * control characters before the colon).
 */
export function safeUrl(url: string): string | null {
    // Browsers drop whitespace and control characters inside a scheme, so `java\tscript:` runs.
    // eslint-disable-next-line no-control-regex
    const squeezed = url.replace(/[\u0000- \u007f]/g, '').toLowerCase()
    const colon = squeezed.indexOf(':')

    if (colon === -1) {
        return url
    }

    // A colon after a path, query or fragment character is not a scheme (`a/b:c`, `?x=a:b`).
    const first = squeezed.search(/[/?#]/)

    if (first !== -1 && first < colon) {
        return url
    }

    return safeSchemes.includes(squeezed.slice(0, colon + 1)) ? url : null
}

/**
 * A character that `text` does not contain, from the Private Use Area: it stands in for each
 * redaction marker while the text is parsed, so markdown cannot turn a marker into a link or
 * hide it.
 */
export function sentinelFor(text: string): string {
    for (let code = 0xe000; code <= 0xf8ff; code++) {
        const candidate = String.fromCharCode(code)

        if (!text.includes(candidate)) {
            return candidate
        }
    }

    // Every private-use character occurs; a marker is then left as the parser reads it.
    return ''
}

/** `text` with every `marker` replaced by `sentinel`. */
export function protectMarkers(
    text: string,
    marker: string,
    sentinel: string,
): string {
    return marker === '' || sentinel === ''
        ? text
        : text.split(marker).join(sentinel)
}

/** `text` with every `sentinel` put back as `marker`. */
export function restoreMarkers(
    text: string,
    marker: string,
    sentinel: string,
): string {
    return sentinel === '' ? text : text.split(sentinel).join(marker)
}

const fenceLine = /^ {0,3}(`{3,}|~{3,})/

/** Whether `line` closes the code fence opened by `fence`. */
function closesFence(line: string, fence: string): boolean {
    const closer = fenceLine.exec(line)

    return (
        closer !== null &&
        closer[1][0] === fence[0] &&
        closer[1].length >= fence.length &&
        line.trim() === closer[1]
    )
}

/**
 * Where to end the part of `text` that starts at `from` when about `length` characters are
 * wanted: at the start of a line after a blank line that is not inside a code fence, so the part
 * ends between blocks. `from` must itself be such a place (or 0). The last such place up to the
 * plain cut is taken when it keeps at least half the part, otherwise the first one up to one more
 * part on. A code fence open at the cut is never split, however long it is: the part then ends
 * after it. Only text with neither falls back to the plain cut of `cutPoint`.
 */
export function blockCutPoint(
    text: string,
    from: number,
    length: number,
    marker: string,
): number {
    const end = cutPoint(text, from + length, marker)

    if (end >= text.length) {
        return text.length
    }

    let fence: string | null = null
    let before = -1
    let position = from

    while (position < text.length) {
        const newline = text.indexOf('\n', position)
        const lineEnd = newline === -1 ? text.length : newline
        const next = newline === -1 ? text.length : newline + 1
        const line = text.slice(position, lineEnd)

        if (fence !== null) {
            if (closesFence(line, fence)) {
                fence = null

                // A fence that was open at the cut ends the part.
                if (position >= end) {
                    return before - from >= length / 2 ? before : next
                }
            }
        } else {
            const opener = fenceLine.exec(line)

            if (opener !== null) {
                fence = opener[1]
            } else if (line.trim() === '' && newline !== -1) {
                if (next <= end) {
                    before = next
                } else if (next < text.length) {
                    return before - from >= length / 2 ? before : next
                }
            }

            // Past one more part with no fence open, nothing better will come.
            if (fence === null && next > end + length) {
                break
            }
        }

        position = next
    }

    // A fence never closed runs to the end of the text.
    if (fence !== null) {
        return before - from >= length / 2 ? before : text.length
    }

    return before > from ? before : end
}

const definitionLine = /^ {0,3}\[[^\]\n]+\]:[ \t]*\S/

/**
 * The link reference definitions of `text` (`[name]: https://…` lines outside code fences), so a
 * part drawn on its own can still resolve a link whose definition is in another part.
 */
export function referenceDefinitions(text: string): string[] {
    const definitions: string[] = []
    let fence: string | null = null

    for (const line of text.split('\n')) {
        if (fence !== null) {
            if (closesFence(line, fence)) {
                fence = null
            }
        } else {
            const opener = fenceLine.exec(line)

            if (opener !== null) {
                fence = opener[1]
            } else if (definitionLine.test(line)) {
                definitions.push(line)
            }
        }
    }

    return definitions
}

/** Block quotes nested deeper than this are not drawn: the parser and renderer recurse once per level. */
export const quoteDepthLimit = 64

/** Whether a line of `text` opens more nested block quotes than the renderer is trusted with. */
export function nestsTooDeep(text: string): boolean {
    let depth = 0
    let lineStart = true

    for (let index = 0; index < text.length; index++) {
        const character = text[index]

        if (character === '\n') {
            depth = 0
            lineStart = true
        } else if (lineStart && character === '>') {
            if (++depth > quoteDepthLimit) {
                return true
            }
        } else if (character !== ' ' && character !== '\t') {
            lineStart = false
        }
    }

    return false
}
