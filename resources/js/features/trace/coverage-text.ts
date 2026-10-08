import type { Coverage, CoverageItem, CoverageReason } from '@/api/types'
import { formatCount } from '@/lib/format'

/** The coverage items in the order the page lists them, with their labels. */
export const coverageItems: { key: keyof Coverage; label: string }[] = [
    { key: 'timing', label: 'Timing' },
    { key: 'responding_model', label: 'Responding model' },
    { key: 'usage', label: 'Usage' },
    { key: 'cost', label: 'Cost' },
    { key: 'system_prompt', label: 'System prompt' },
    { key: 'payloads', label: 'Payloads' },
]

const reasons: Record<string, string | undefined> = {
    unfinished: 'the spans without it never finished',
    not_reported: 'not reported by the SDK or provider',
    streamed: 'streamed runs do not report the responding model',
    no_price: 'no price is configured for a model',
}

/** Why something is missing, in words. `not_stored` depends on what was not stored. */
export function coverageReason(
    key: keyof Coverage,
    reason: CoverageReason,
): string | null {
    if (reason !== 'not_stored') {
        // A reason a newer API sends and this page does not know is left out.
        return reasons[reason] ?? null
    }

    switch (key) {
        case 'system_prompt':
            return 'no system prompt was stored'
        case 'payloads':
            return 'payloads were not stored; payload capture may be switched off (trail.capture.enabled)'
        default:
            return 'it was not stored'
    }
}

/** One item in words: the state with the server's counts, and for a gap the reason. */
export function coverageSentence(
    key: keyof Coverage,
    item: CoverageItem,
): string {
    const counts = `${formatCount(item.captured)} of ${formatCount(item.expected)}`

    // A state a newer API sends is shown as received: `item.state` is typed, the wire is not.
    switch (item.state as string) {
        case 'captured':
            return `Captured (${counts})`
        case 'not_applicable':
            return 'Not applicable to this run'
        case 'partial':
        case 'not_captured': {
            const state =
                item.state === 'partial'
                    ? `Partly captured (${counts})`
                    : `Not captured (${counts})`
            const reason =
                item.reason === null ? null : coverageReason(key, item.reason)

            return reason === null ? state : `${state}: ${reason}`
        }
        default:
            return `Reported as ${item.state} (${counts})`
    }
}
