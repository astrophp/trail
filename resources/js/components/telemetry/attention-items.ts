import type { To } from 'react-router'
import { issueKinds } from '@/api/traces'
import type {
    AttentionItem,
    AttentionKind,
    AttentionRow,
    IssueKind,
} from '@/api/types'
import { isAttentionKind } from '@/components/telemetry/attention-wording'
import type { TracesLinkerFor } from '@/api/traces-link'
import type { TimeRangePreset } from '@/lib/time-range'

export type BreakdownEntry =
    | { readable: true; row: AttentionRow; issueKind: IssueKind; to: To }
    | { readable: false; issueKind: string; count: number }

/** An item this client can word and link, or one it cannot: what the API called it, and its count. */
export type AttentionEntry =
    | {
          readable: true
          item: AttentionItem
          kind: AttentionKind
          to: To
          breakdown: BreakdownEntry[]
      }
    | { readable: false; kind: string; count: number; reason: string }

const isIssueKind = (kind: string): kind is IssueKind =>
    issueKinds.some((known) => known === kind)

const reasonOf = (error: unknown) =>
    error instanceof Error ? error.message : 'Unknown failure.'

function readRow(
    row: AttentionRow,
    range: TimeRangePreset,
    linkFor: TracesLinkerFor,
): BreakdownEntry {
    if (!isIssueKind(row.issue_kind)) {
        return {
            readable: false,
            issueKind: String(row.issue_kind),
            count: row.count,
        }
    }

    try {
        return {
            readable: true,
            row,
            issueKind: row.issue_kind,
            to: linkFor(range, row.filters),
        }
    } catch {
        return { readable: false, issueKind: row.issue_kind, count: row.count }
    }
}

/**
 * Each item of the answer as something that can be drawn, one at a time: an item whose kind has
 * no words here, or whose filters the traces list would not read the same way, is `readable:
 * false` and the others are unaffected. The reason is for the console, not the screen.
 */
export function readAttention(
    items: AttentionItem[],
    range: TimeRangePreset,
    linkFor: TracesLinkerFor,
): AttentionEntry[] {
    return items.map((item): AttentionEntry => {
        if (!isAttentionKind(item.kind)) {
            return {
                readable: false,
                kind: String(item.kind),
                count: item.count,
                reason: `The kind "${String(item.kind)}" has no words.`,
            }
        }

        try {
            return {
                readable: true,
                item,
                kind: item.kind,
                to: linkFor(range, item.filters),
                breakdown: item.breakdown.map((row) =>
                    readRow(row, range, linkFor),
                ),
            }
        } catch (error) {
            return {
                readable: false,
                kind: item.kind,
                count: item.count,
                reason: reasonOf(error),
            }
        }
    })
}

/** What could not be read, for one report to the console: the items, and the issue kinds of the rows. */
export function unreadable(entries: AttentionEntry[]): string[] {
    return entries.flatMap((entry) =>
        entry.readable
            ? entry.breakdown.flatMap((row) =>
                  row.readable
                      ? []
                      : [`Issue kind "${row.issueKind}" of ${entry.kind}.`],
              )
            : [`${entry.kind}: ${entry.reason}`],
    )
}
