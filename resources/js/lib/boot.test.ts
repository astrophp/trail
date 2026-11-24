import { afterEach, describe, expect, it } from 'vitest'
import { boot, parseBoot } from '@/lib/boot'

const full = {
    path: '/trail',
    apiPath: '/trail/api',
    csrfToken: 'abc',
    appName: 'Acme',
    environment: 'production',
    timezone: 'UTC',
    version: 'v0.1.0',
    staleAfter: 900,
    recording: 'paused',
    currency: 'EUR',
}

describe('parseBoot', () => {
    it('reads what the page provides', () => {
        expect(parseBoot(full)).toEqual(full)
    })

    it('falls back when there is no boot object', () => {
        for (const source of [undefined, null, 'trail', 3]) {
            expect(parseBoot(source)).toMatchObject({
                path: '/trail',
                apiPath: '/trail/api',
                csrfToken: null,
                appName: null,
                recording: null,
                currency: 'USD',
            })
        }
    })

    it('normalises the base path', () => {
        expect(parseBoot({ path: 'admin/trail/' }).path).toBe('/admin/trail')
        expect(parseBoot({ path: '/', apiPath: undefined }).apiPath).toBe(
            '/api',
        )
    })

    it('keeps a missing value as null and drops a malformed one', () => {
        const parsed = parseBoot({
            ...full,
            appName: '',
            csrfToken: 12,
            version: null,
            recording: 'sideways',
            staleAfter: 'soon',
        })

        expect(parsed).toMatchObject({
            appName: null,
            csrfToken: null,
            version: null,
            recording: null,
            staleAfter: 3600,
        })
    })
})

describe('parseBoot currency', () => {
    it('is US dollars when the page does not say', () => {
        expect(parseBoot({ ...full, currency: undefined }).currency).toBe('USD')
    })

    it.each(['USD', 'EUR', 'CNY'])('keeps the code %s', (currency) => {
        expect(parseBoot({ ...full, currency }).currency).toBe(currency)
    })

    it.each([null, 'usd', 'US', 'USDX', 'U$D', '', 12, true])(
        'is null for %j, the setting that is not valid',
        (currency) => {
            expect(parseBoot({ ...full, currency }).currency).toBeNull()
        },
    )
})

describe('boot', () => {
    afterEach(() => {
        delete window.Trail
    })

    it('reads window.Trail once and keeps the result', () => {
        window.Trail = full
        const first = boot()

        window.Trail = { ...full, appName: 'Changed' }

        expect(first.appName).toBe('Acme')
        expect(boot()).toBe(first)
    })
})
