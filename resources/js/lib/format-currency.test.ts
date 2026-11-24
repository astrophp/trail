import { afterEach, describe, expect, it, vi } from 'vitest'

type Format = typeof import('@/lib/format')

/**
 * The boot object and the money formatters are both kept after first use, so each currency gets
 * a fresh copy of the modules, read after `window.Trail` is set.
 */
async function formatFor(currency: unknown): Promise<Format> {
    vi.resetModules()
    window.Trail = { currency }

    return import('@/lib/format')
}

afterEach(() => {
    delete window.Trail
    vi.resetModules()
})

const amounts = [0, 0.0466, 0.00004, 0.99999, 1234.5]

describe.each([
    ['USD', ['$0.00', '$0.0466', '<$0.0001', '$1.00', '$1,234.50']],
    ['EUR', ['€0.00', '€0.0466', '<€0.0001', '€1.00', '€1,234.50']],
    ['CNY', ['CN¥0.00', 'CN¥0.0466', '<CN¥0.0001', 'CN¥1.00', 'CN¥1,234.50']],
    ['JPY', ['¥0.00', '¥0.0466', '<¥0.0001', '¥1.00', '¥1,234.50']],
    [
        // A well-formed code the runtime has no sign for is written out, with the space Intl puts.
        'XXQ',
        ['XXQ 0.00', 'XXQ 0.0466', '<XXQ 0.0001', 'XXQ 1.00', 'XXQ 1,234.50'],
    ],
    [null, ['0.00', '0.0466', '<0.0001', '1.00', '1,234.50']],
])('formatCost with the currency %s', (currency, expected) => {
    it.each(amounts.map((amount, index) => [amount, expected[index]]))(
        'formats %s as %s',
        async (amount, text) => {
            const { formatCost } = await formatFor(currency)

            expect(formatCost(amount)).toBe(text)
        },
    )
})

describe('formatCost with a currency the page did not provide', () => {
    it('falls back to US dollars', async () => {
        vi.resetModules()
        delete window.Trail
        const { formatCost } = await import('@/lib/format')

        expect(formatCost(1234.5)).toBe('$1,234.50')
    })
})

describe('the currency in words', () => {
    it.each([
        ['USD', 'USD', 'US dollars', 'US dollars per million tokens'],
        ['EUR', 'EUR', 'EUR', 'EUR per million tokens'],
        [null, null, null, 'per million tokens'],
    ])('reads %s', async (currency, code, name, unit) => {
        const format = await formatFor(currency)

        expect(format.currencyCode()).toBe(code)
        expect(format.currencyName()).toBe(name)
        expect(format.tokenRateUnit()).toBe(unit)
    })

    it('puts a preposition only before a currency', async () => {
        expect((await formatFor('USD')).tokenRateUnit('in')).toBe(
            'in US dollars per million tokens',
        )
        expect((await formatFor(null)).tokenRateUnit('in')).toBe(
            'per million tokens',
        )
    })

    it('labels a rate with the code, or capitalises the unit without one', async () => {
        expect((await formatFor('EUR')).rateLabel('search unit')).toBe(
            'EUR per search unit',
        )
        expect((await formatFor(null)).rateLabel('search unit')).toBe(
            'Per search unit',
        )
    })
})
