// Recharts keeps its state in a Redux Toolkit store whose updates are batched by racing
// `requestAnimationFrame` against a 100 ms `setTimeout`; whichever fires first runs the update and
// then calls `cancelAnimationFrame` (and `clearTimeout`) for the other. When a test file ends
// between a chart's render and its frame, jsdom is torn down first, the frame never runs, and the
// timer fires into a world without `cancelAnimationFrame`: "Uncaught Exception: ReferenceError:
// cancelAnimationFrame is not defined". It depends on timing, so it shows up only on a busy machine.
//
// The guard counts the frames that were asked for and have neither run nor been cancelled, so a
// test file can wait for them before its environment goes away. The frame then runs, and cancels
// the timer.

const pending = new Set<number>()
let installed = false

/** Wraps the frame functions of the global scope once, to count the frames in flight. */
export function trackFrames(): void {
    if (installed) {
        return
    }

    installed = true

    const request = globalThis.requestAnimationFrame.bind(globalThis)
    const cancel = globalThis.cancelAnimationFrame.bind(globalThis)

    globalThis.requestAnimationFrame = (callback) => {
        const id = request((time) => {
            pending.delete(id)
            callback(time)
        })

        pending.add(id)

        return id
    }
    globalThis.cancelAnimationFrame = (id) => {
        pending.delete(id)
        cancel(id)
    }
}

/** How many frames have been asked for and have neither run nor been cancelled. */
export const framesInFlight = () => pending.size

/** Resolves once no frame is in flight, or after `limit` milliseconds, whichever is first. */
export async function settleFrames(limit = 2000): Promise<void> {
    const deadline = Date.now() + limit

    while (pending.size > 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 5))
    }
}
