import { describe, expect, it } from 'vitest'
import { parseReturn, returnTo } from '@/lib/return-context'

const allowed = ['/traces', '/conversations/:id']

describe('returnTo', () => {
    it('joins the path and its query', () => {
        expect(returnTo('/traces', '?range=7d&page=2')).toBe(
            '/traces?range=7d&page=2',
        )
    })

    it('leaves out a from of the page own, wherever it is in the query', () => {
        expect(returnTo('/traces', '?from=%2Ftraces&status=failed')).toBe(
            '/traces?status=failed',
        )
        expect(returnTo('/traces', '?status=failed&from=%2Ftraces')).toBe(
            '/traces?status=failed',
        )
        expect(returnTo('/traces', '?from=%2Ftraces')).toBe('/traces')
    })

    it('adds the question mark when the query lacks it, and none for an empty one', () => {
        expect(returnTo('/traces', 'range=7d')).toBe('/traces?range=7d')
        expect(returnTo('/traces', '')).toBe('/traces')
    })
})

describe('parseReturn', () => {
    it('round-trips what returnTo builds', () => {
        const value = returnTo(
            '/traces',
            '?range=7d&status=failed&sort=-cost&page=2&search=a%20b',
        )

        expect(parseReturn(value, allowed)).toEqual({
            pathname: '/traces',
            search: '?range=7d&status=failed&sort=-cost&page=2&search=a%20b',
        })
    })

    it('accepts a bare list path, and a pattern with a parameter', () => {
        expect(parseReturn('/traces', allowed)).toEqual({
            pathname: '/traces',
            search: '',
        })
        expect(parseReturn('/conversations/abc-1?page=2', allowed)).toEqual({
            pathname: '/conversations/abc-1',
            search: '?page=2',
        })
    })

    it.each([
        ['an empty string', ''],
        ['null', null],
        ['undefined', undefined],
        ['a protocol-relative url', '//evil.example'],
        ['a backslash host', '/\\evil.example'],
        ['a backslash anywhere', '/traces\\x'],
        ['an absolute url', 'https://evil.example'],
        ['a script url', 'javascript:alert(1)'],
        ['dot segments', '/traces/../../x'],
        ['an encoded protocol-relative url', '%2F%2Fevil.example'],
        ['an encoded host after one slash', '/%2F%2Fevil.example'],
        ['the decoded form of it', '//evil.example/traces'],
        ['a newline', '/traces?a=1\nb=2'],
        ['a tab', '/traces?a=1\tb'],
        ['a space', '/traces?a=1 b'],
        ['a non-breaking space', '/traces?a= '],
        ['a null byte', '/traces\u0000'],
        ['a fragment', '/traces#x'],
        ['a target with a from of its own', '/traces?from=%2Ftraces'],
        ['a nested from after other parameters', '/traces?a=1&from=%2Fx'],
        ['a path that is no list', '/unknown-page'],
        ['a page below a list', '/traces/abc'],
        ['a trailing slash', '/traces/'],
        ['a parameter segment left empty', '/conversations/'],
        ['a relative path', 'traces'],
    ])('rejects %s', (_name, value) => {
        expect(parseReturn(value, allowed)).toBeNull()
    })

    it('rejects a value over the length limit', () => {
        expect(parseReturn(`/traces?x=${'a'.repeat(2000)}`, allowed)).toBeNull()
        expect(
            parseReturn(`/traces?x=${'a'.repeat(100)}`, allowed),
        ).not.toBeNull()
    })

    it('accepts only the paths it is told about', () => {
        expect(parseReturn('/traces', ['/agents/:agent'])).toBeNull()
        expect(parseReturn('/traces', [])).toBeNull()
    })
})
