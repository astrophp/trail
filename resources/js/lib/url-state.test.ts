import { describe, expect, it } from 'vitest'
import {
    boolParam,
    enumParam,
    intParam,
    readState,
    stringParam,
    writeState,
} from '@/lib/url-state'

const params = {
    q: stringParam(),
    page: intParam(1, { min: 1 }),
    slow: boolParam(),
    sort: enumParam(['-started_at', 'cost'] as const, '-started_at'),
}

const search = (text: string) => new URLSearchParams(text)

describe('readState', () => {
    it('answers the defaults for an empty query string', () => {
        expect(readState(params, search(''))).toEqual({
            q: '',
            page: 1,
            slow: false,
            sort: '-started_at',
        })
    })

    it('reads every kind of param', () => {
        expect(
            readState(params, search('q=hello+world&page=3&slow=1&sort=cost')),
        ).toEqual({ q: 'hello world', page: 3, slow: true, sort: 'cost' })
    })

    it('falls back to the default for an invalid value', () => {
        expect(readState(params, search('page=0&slow=yes&sort=nope'))).toEqual({
            q: '',
            page: 1,
            slow: false,
            sort: '-started_at',
        })
        expect(readState(params, search('page=2.5')).page).toBe(1)
        expect(readState(params, search('page=abc')).page).toBe(1)
    })
})

describe('writeState', () => {
    it('round-trips every kind of param', () => {
        const written = writeState(params, search(''), {
            q: 'a b',
            page: 4,
            slow: true,
            sort: 'cost',
        })

        expect(written.toString()).toBe('q=a+b&page=4&slow=1&sort=cost')
        expect(readState(params, written)).toEqual({
            q: 'a b',
            page: 4,
            slow: true,
            sort: 'cost',
        })
    })

    it('leaves out a value equal to its default', () => {
        expect(
            writeState(params, search('page=3&slow=1'), {
                page: 1,
                slow: false,
            }).toString(),
        ).toBe('')
    })

    it('keeps other params, in their place, and orders its own', () => {
        expect(
            writeState(params, search('utm=x&sort=cost&page=2&utm=y'), {
                q: 'z',
            }).toString(),
        ).toBe('utm=x&utm=y&q=z&page=2&sort=cost')
    })

    it('drops an invalid value it did not patch', () => {
        expect(
            writeState(params, search('page=0&sort=cost'), {
                q: 'z',
            }).toString(),
        ).toBe('q=z&sort=cost')
    })
})
