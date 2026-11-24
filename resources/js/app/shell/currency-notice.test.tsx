import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { appReady, renderApp } from '@/test/render-app'
import { mockApi } from '@/test/traces-api'

// The notice reads the install's currency from the boot object, which is kept after first use:
// the tests set what it holds before each render.
const install = vi.hoisted<{ currency: string | null }>(() => ({
    currency: 'USD',
}))

vi.mock('@/lib/boot', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/boot')>()

    return {
        ...actual,
        boot: () => actual.parseBoot({ currency: install.currency }),
    }
})

afterEach(() => {
    install.currency = 'USD'
})

const title = 'Currency setting is not valid'

describe('the currency notice', () => {
    it('is shown above the page when the currency setting is not valid', async () => {
        install.currency = null
        mockApi()
        renderApp('/traces')
        await appReady()

        const notice = screen.getByText(title).closest('[data-slot="notice"]')

        expect(notice).toHaveTextContent(
            'Amounts are shown without a currency, and bundled prices are not used, until trail.currency is a three-letter ISO 4217 code such as USD.',
        )
        expect(
            screen.getByRole('heading', { level: 1, name: 'Traces' }),
        ).toBeVisible()
        expect(notice).not.toContainElement(
            screen.queryByRole('button', { name: 'Dismiss' }),
        )
    })

    it.each(['USD', 'EUR'])('is not shown for %s', async (currency) => {
        install.currency = currency
        mockApi()
        renderApp('/traces')
        await appReady()

        expect(screen.queryByText(title)).not.toBeInTheDocument()
    })
})
