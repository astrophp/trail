import { describe, expect, it } from 'vitest'
import {
    jsonEqual,
    cutPoint,
    entriesOf,
    isContainer,
    prettyJson,
    splitOnMarker,
} from '@/lib/json'

describe('isContainer', () => {
    it('is true for arrays and objects only', () => {
        expect(isContainer([])).toBe(true)
        expect(isContainer({})).toBe(true)
        expect(isContainer(null)).toBe(false)
        expect(isContainer('text')).toBe(false)
        expect(isContainer(1)).toBe(false)
        expect(isContainer(false)).toBe(false)
    })
})

describe('entriesOf', () => {
    it('keys an array by index and an object by name', () => {
        expect(entriesOf(['a', 'b'], 10)).toEqual({
            entries: [
                ['0', 'a'],
                ['1', 'b'],
            ],
            total: 2,
        })
        expect(entriesOf({ x: 1, y: null }, 10)).toEqual({
            entries: [
                ['x', 1],
                ['y', null],
            ],
            total: 2,
        })
    })

    it('returns the first entries only, with the total', () => {
        expect(entriesOf(['a', 'b', 'c', 'd'], 2)).toEqual({
            entries: [
                ['0', 'a'],
                ['1', 'b'],
            ],
            total: 4,
        })
        expect(entriesOf({ a: 1, b: 2, c: 3 }, 1)).toEqual({
            entries: [['a', 1]],
            total: 3,
        })
    })

    it('counts only an object own keys', () => {
        const value = Object.create({ inherited: 1 }) as Record<string, number>

        value.own = 2

        expect(entriesOf(value, 10)).toEqual({
            entries: [['own', 2]],
            total: 1,
        })
    })

    it('reads about `limit` items of a huge array, not all of them', () => {
        let reads = 0
        const huge = new Proxy(new Array<number>(1_000_000).fill(7), {
            get(target, property, receiver) {
                if (typeof property === 'string' && /^\d+$/.test(property)) {
                    reads++
                }

                return Reflect.get(target, property, receiver) as unknown
            },
        })

        const { entries, total } = entriesOf(huge, 100)

        expect(total).toBe(1_000_000)
        expect(entries).toHaveLength(100)
        expect(reads).toBeGreaterThan(0)
        expect(reads).toBeLessThanOrEqual(110)
    })
})

describe('cutPoint', () => {
    it('cuts where asked when nothing is in the way', () => {
        expect(cutPoint('abcdefgh', 4, '[x]')).toBe(4)
    })

    it('never cuts past the end', () => {
        expect(cutPoint('abc', 10, '[x]')).toBe(3)
    })

    it('does not split a surrogate pair', () => {
        expect(cutPoint('ab\u{1F600}cd', 3, '')).toBe(4)
    })

    it('extends a cut that lands inside a marker to the end of the marker', () => {
        const text = 'aa[redacted]bb'

        expect(cutPoint(text, 5, '[redacted]')).toBe(12)
        expect(cutPoint(text, 3, '[redacted]')).toBe(12)
        expect(cutPoint(text, 11, '[redacted]')).toBe(12)
    })

    it('leaves a cut at either edge of a marker alone', () => {
        const text = 'aa[redacted]bb'

        expect(cutPoint(text, 2, '[redacted]')).toBe(2)
        expect(cutPoint(text, 12, '[redacted]')).toBe(12)
    })
})

describe('prettyJson', () => {
    it('indents by two spaces', () => {
        expect(prettyJson({ a: [1] })).toBe('{\n  "a": [\n    1\n  ]\n}')
    })
})

describe('splitOnMarker', () => {
    it('returns the text whole when there is no marker in it', () => {
        expect(splitOnMarker('plain', '[redacted]')).toEqual([
            { text: 'plain', marker: false },
        ])
    })

    it('keeps each marker as a part of its own', () => {
        expect(
            splitOnMarker('a [redacted] b [redacted]', '[redacted]'),
        ).toEqual([
            { text: 'a ', marker: false },
            { text: '[redacted]', marker: true },
            { text: ' b ', marker: false },
            { text: '[redacted]', marker: true },
        ])
    })

    it('treats an empty marker as no marker', () => {
        expect(splitOnMarker('abc', '')).toEqual([
            { text: 'abc', marker: false },
        ])
    })
})

describe('jsonEqual', () => {
    it('compares scalars by value and by type', () => {
        expect(jsonEqual('a', 'a')).toBe(true)
        expect(jsonEqual(1, 1)).toBe(true)
        expect(jsonEqual(null, null)).toBe(true)
        expect(jsonEqual(1, '1')).toBe(false)
        expect(jsonEqual(0, false)).toBe(false)
        expect(jsonEqual(null, 0)).toBe(false)
    })

    it('ignores the order of object keys, and not the order of array items', () => {
        expect(jsonEqual({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true)
        expect(jsonEqual([1, 2], [2, 1])).toBe(false)
    })

    it('compares nested values and sizes', () => {
        expect(
            jsonEqual({ a: { b: [{ c: 1 }] } }, { a: { b: [{ c: 1 }] } }),
        ).toBe(true)
        expect(
            jsonEqual({ a: { b: [{ c: 1 }] } }, { a: { b: [{ c: 2 }] } }),
        ).toBe(false)
        expect(jsonEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
        expect(jsonEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false)
        expect(jsonEqual([1], [1, 2])).toBe(false)
    })

    it('does not equate an array with an object, or a missing value with anything', () => {
        expect(jsonEqual([], {})).toBe(false)
        expect(jsonEqual({ 0: 'a' }, ['a'])).toBe(false)
        expect(jsonEqual(undefined, undefined)).toBe(true)
        expect(jsonEqual(undefined, null)).toBe(false)
        expect(jsonEqual({ a: null }, {})).toBe(false)
    })
})
