import type { CoverageItem, CoverageReason } from '@/api/types'

const causes: Partial<Record<CoverageReason, string>> = {
    not_stored: 'Payload capture did not store it.',
    unfinished: 'The run had not finished.',
    not_reported: 'The provider did not report it.',
}

/** What to say about an agent with no system prompt: that none was stored, and why when the run's coverage says so. */
export function noSystemPromptWords(coverage: CoverageItem): string {
    const base = 'No system prompt was stored for this agent.'
    const gap =
        coverage.state === 'not_captured' || coverage.state === 'partial'
    const cause =
        gap && coverage.reason !== null ? causes[coverage.reason] : undefined

    return cause === undefined ? base : `${base} ${cause}`
}
