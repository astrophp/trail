import { useEffect } from 'react'
import type { AgentBreakdownResponse } from '@/api/types'
import type { TimeRangePreset } from '@/lib/time-range'

/** What the two panels of the breakdown draw from, and the states they share. */
export type BreakdownState = {
    /** The answer to draw; `undefined` while there is none, or when the request failed. */
    answer: AgentBreakdownResponse | undefined
    /** The range the answer was counted over: the previous one while the next loads. */
    shown: TimeRangePreset
    /** Nothing is known yet. */
    loading: boolean
    /** The answer is the previous range's. */
    busy: boolean
    /** Runs are still running, so the rows wait for them and are not refreshed meanwhile. */
    waiting: boolean
    /** The request failed and there is nothing to show instead. */
    failure: { message: string; onRetry: () => void } | undefined
    /** The agent's own runs, which a row's part is a part of; `null` when there is no such total (or none that is of the range shown). */
    total: number | null
    /** The agent has runs of its own. When it has none, its rows are all inside runs it was delegated to. */
    hasOwnRuns: boolean
}

/**
 * Says once where a developer looks when a row could not be linked: a bug to fix, not a state of
 * the data.
 */
export function useUnlinkedReport(what: string, reasons: string[]) {
    const report = reasons.join('\n')

    useEffect(() => {
        if (report !== '' && import.meta.env.DEV) {
            console.error(`Trail could not link every ${what} row:\n${report}`)
        }
    }, [what, report])
}
