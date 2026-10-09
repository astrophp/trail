import type { To } from 'react-router'
import { tracesLinkFor } from '@/api/traces-link'
import type { TimeRangePreset } from '@/lib/time-range'

/** A row of a breakdown and where it leads: to the runs the row counted, or nowhere. */
export type LinkedRow<T> = { row: T; to: To | null; reason: string | null }

/**
 * Each row with the link to the runs behind it: the traces list over the range the row was counted
 * for, narrowed by exactly the filters the API gave it, so the list holds as many runs as the row
 * says. A filter the list does not keep in its address (or a value it would not read) would lead to
 * other runs, so that row has no link and says why, for the console.
 */
export function linkRows<T extends { filters: Record<string, string> }>(
    rows: T[],
    range: TimeRangePreset,
): LinkedRow<T>[] {
    return rows.map((row) => {
        try {
            return { row, to: tracesLinkFor(range, row.filters), reason: null }
        } catch (error) {
            return {
                row,
                to: null,
                reason:
                    error instanceof Error ? error.message : 'Unknown failure.',
            }
        }
    })
}

/** What could not be linked, for one report to the console. */
export const unlinkable = <T>(rows: LinkedRow<T>[]): string[] =>
    rows.flatMap(({ reason }) => (reason === null ? [] : [reason]))
