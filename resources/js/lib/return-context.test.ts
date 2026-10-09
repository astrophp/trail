import { describe, expect, it } from 'vitest'
import { parseReturn, returnTo } from '@/lib/return-context'

const allowed = ['/traces', '/traces/:traceId']

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
        expect(parseReturn('/traces/abc-1?page=2', allowed)).toEqual({
            pathname: '/traces/abc-1',
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
        ['a page below a page of the list', '/traces/abc/def'],
        ['a trailing slash', '/traces/'],
        ['a parameter segment left empty', '/traces/'],
        ['a relative path', 'traces'],
    ])('rejects %s', (_name, value) => {
        expect(parseReturn(value, allowed)).toBeNull()
    })

    it('rejects a value over the length limit', () => {
        expect(parseReturn(`/traces?x=${'a'.repeat(4100)}`, allowed)).toBeNull()
        expect(
            parseReturn(`/traces?x=${'a'.repeat(100)}`, allowed),
        ).not.toBeNull()
        // Past the old limit of 2000, and still read.
        expect(
            parseReturn(`/traces?x=${'a'.repeat(3000)}`, allowed),
        ).not.toBeNull()
    })

    it('accepts only the paths it is told about', () => {
        expect(parseReturn('/traces', ['/traces/:traceId'])).toBeNull()
        expect(parseReturn('/traces', [])).toBeNull()
    })
})

describe('a return to a conversation', () => {
    const pages = ['/traces', '/conversations/transcript']
    const from = (id: string, turn: string) =>
        returnTo(
            '/conversations/transcript',
            new URLSearchParams({ id, turn }).toString(),
        )

    it.each([
        ['a slash', 'support/ada'],
        ['a space', 'support ada 1042'],
        ['non-ASCII characters', 'günlük/日本語/😀'],
        ['reserved characters', 'a&b=c?d#e%f+g'],
    ])('reads back an id with %s as it was', (_name, id) => {
        const target = parseReturn(from(id, 'run-1'), pages)

        expect(target?.pathname).toBe('/conversations/transcript')
        expect(new URLSearchParams(target?.search)).toEqual(
            new URLSearchParams({ id, turn: 'run-1' }),
        )
    })

    it.each([
        ['three-byte characters', '日'.repeat(255)],
        ['four-byte characters', '😀'.repeat(255)],
    ])('reads back the longest id there is: 255 %s', (_name, id) => {
        const value = from(id, '0199c2f4-6a1e-7c3b-9a55-0e8a4c1d2f30')

        // Past the 2000 characters the value was once limited to.
        expect(value.length).toBeGreaterThan(2000)
        expect(
            new URLSearchParams(parseReturn(value, pages)?.search).get('id'),
        ).toBe(id)
    })

    it.each([
        [
            'an address outside the dashboard',
            'https://evil.example/conversations/transcript',
        ],
        [
            'a protocol-relative address',
            '//evil.example/conversations/transcript?id=x',
        ],
        ['a page that is no known route', '/conversations/other?id=x'],
        [
            'a conversation page below another path',
            '/conversations/transcript/x?id=x',
        ],
    ])('still refuses %s', (_name, value) => {
        expect(parseReturn(value, pages)).toBeNull()
    })
})
