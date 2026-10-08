import { stringParam, type Param } from '@/lib/url-state'

/** The API takes at most this many characters of a search. */
export const searchLength = 200

/** What a search means: without the spaces around it, and no longer than the API reads. */
export function normalizeSearch(text: string): string {
    return text.trim().slice(0, searchLength)
}

/** A list's search as the URL keeps it, under `search`. */
export const searchParam: Param<string> = {
    ...stringParam(),
    parse: normalizeSearch,
}
