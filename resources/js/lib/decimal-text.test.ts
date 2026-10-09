import { describe, expect, it } from 'vitest'
import { decimalText, parseDecimalText } from '@/lib/decimal-text'

describe('parseDecimalText', () => {
    it('reads blank as no value, never as zero', () => {
        expect(parseDecimalText('')).toEqual({ ok: true, value: null })
        expect(parseDecimalText('   ')).toEqual({ ok: true, value: null })
    })

    it('reads zero as the value zero, whatever its spelling', () => {
        expect(parseDecimalText('0')).toEqual({ ok: true, value: 0 })
        expect(parseDecimalText('0.00')).toEqual({ ok: true, value: 0 })
    })

    it('reads plain decimals, ignoring spaces around them', () => {
        expect(parseDecimalText('3')).toEqual({ ok: true, value: 3 })
        expect(parseDecimalText(' 3.75 ')).toEqual({ ok: true, value: 3.75 })
        expect(parseDecimalText('0.000001')).toEqual({
            ok: true,
            value: 0.000001,
        })
    })

    it.each(['-1', '+1', '.5', '3.', '1e3', '1,5', 'abc', '3 5', '0x10'])(
        'refuses %j',
        (text) => {
            const result = parseDecimalText(text)

            expect(result.ok).toBe(false)
        },
    )

    it('refuses digits too long to be a finite number', () => {
        expect(parseDecimalText('9'.repeat(400)).ok).toBe(false)
    })
})

describe('decimalText', () => {
    it('writes no value as blank and zero as 0', () => {
        expect(decimalText(null)).toBe('')
        expect(decimalText(0)).toBe('0')
    })

    it('writes a rate as it reads back', () => {
        expect(decimalText(0.3)).toBe('0.3')
        expect(decimalText(15)).toBe('15')
        expect(decimalText(0.000001)).toBe('0.000001')
    })
})
