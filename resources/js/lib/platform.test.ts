import { afterEach, describe, expect, it, vi } from 'vitest'
import { isApplePlatform } from '@/lib/platform'

afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(window.navigator, 'userAgentData')
})

const platformIs = (platform: string) =>
    vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

describe('isApplePlatform', () => {
    it.each(['MacIntel', 'iPhone', 'iPad'])('is true on %s', (platform) => {
        platformIs(platform)

        expect(isApplePlatform()).toBe(true)
    })

    it.each(['Win32', 'Linux x86_64'])('is false on %s', (platform) => {
        platformIs(platform)

        expect(isApplePlatform()).toBe(false)
    })

    it('prefers the platform the browser reports in userAgentData', () => {
        platformIs('Win32')
        Object.defineProperty(window.navigator, 'userAgentData', {
            configurable: true,
            value: { platform: 'macOS' },
        })

        expect(isApplePlatform()).toBe(true)
    })
})
