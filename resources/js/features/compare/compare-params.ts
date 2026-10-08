import { stringParam } from '@/lib/url-state'

/** What the compare page keeps in the URL: the ids of the two runs, A and B. */
export const compareParams = { a: stringParam(), b: stringParam() }

/** Two runs can be compared when both are chosen and they are not the same run. */
export function canCompare(a: string, b: string): boolean {
    return a !== '' && b !== '' && a !== b
}
