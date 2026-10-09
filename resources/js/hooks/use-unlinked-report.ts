import { useEffect } from 'react'

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
