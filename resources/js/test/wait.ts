import { act } from '@testing-library/react'

/**
 * Waits for something the page does not show, such as a request having been made. Testing
 * Library's own `waitFor` looks again on a `setInterval`, which tests of the page's refreshing
 * replace with a fake clock, so for a condition the DOM does not change with it would look once,
 * and again only at its time limit. This looks again every few milliseconds on the real
 * `setTimeout`, and stops on the condition, never on a count of milliseconds: the limit is only
 * how long a failing test takes to say so.
 */
export async function until(check: () => void, limit = 4000) {
    const deadline = Date.now() + limit

    for (;;) {
        try {
            check()

            return
        } catch (error) {
            if (Date.now() > deadline) {
                throw error
            }

            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 5))
            })
        }
    }
}
