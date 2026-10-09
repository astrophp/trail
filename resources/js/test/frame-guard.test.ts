import { afterEach, describe, expect, it, vi } from 'vitest'
import { finishFrames, framesInFlight, settleFrames } from '@/test/frame-guard'

// `setup.ts` installs the guard for every test file.

describe('the frame guard', () => {
    it('counts a frame until it has run', async () => {
        const before = framesInFlight()
        let ran = false

        requestAnimationFrame(() => {
            ran = true
        })

        expect(framesInFlight()).toBe(before + 1)

        await settleFrames()

        expect(ran).toBe(true)
        expect(framesInFlight()).toBe(before)
    })

    it('stops counting a frame that was cancelled, and the frame does not run', async () => {
        const before = framesInFlight()
        let ran = false
        const id = requestAnimationFrame(() => {
            ran = true
        })

        expect(framesInFlight()).toBe(before + 1)

        cancelAnimationFrame(id)

        expect(framesInFlight()).toBe(before)

        await new Promise((resolve) => setTimeout(resolve, 50))

        expect(ran).toBe(false)
    })

    it('gives up waiting after its limit', async () => {
        const before = Date.now()
        // A frame that is asked for again from inside itself never leaves the guard idle.
        let again = true
        const loop = () => {
            if (again) {
                requestAnimationFrame(loop)
            }
        }

        requestAnimationFrame(loop)
        await settleFrames(60)
        again = false

        expect(Date.now() - before).toBeGreaterThanOrEqual(55)
        expect(Date.now() - before).toBeLessThan(1000)

        await settleFrames()
    })
})

describe('finishing a file', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('waits for a frame even when the file left fake timers installed', async () => {
        let ran = false

        requestAnimationFrame(() => {
            ran = true
        })
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

        expect(vi.isFakeTimers()).toBe(true)

        await finishFrames()

        expect(vi.isFakeTimers()).toBe(false)
        expect(ran).toBe(true)
        expect(framesInFlight()).toBe(0)
    })
})
