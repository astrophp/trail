import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { forgetUsageRefreshFailures } from '@/features/usage/use-usage'
import { forgetUsageBreakdownRefreshFailures } from '@/features/usage/use-usage-breakdown'
import { forgetUsageSpendRefreshFailures } from '@/features/usage/use-usage-spend'
import { renderApp } from '@/test/render-app'
import { mockQuietApi, rowsLoaded, sortButton, tab } from '@/test/usage-api'

beforeEach(() => {
    forgetUsageRefreshFailures()
    forgetUsageBreakdownRefreshFailures()
    forgetUsageSpendRefreshFailures()
})

const breakdownLink = (by = 'model') =>
    screen.getByRole('link', { name: `Export the breakdown by ${by} as CSV` })
const spendLink = () =>
    screen.getByRole('link', {
        name: 'Export the estimated cost and its projection as CSV',
    })

async function open(route = '/usage') {
    mockQuietApi()
    renderApp(route)
    await rowsLoaded()
    await waitFor(() =>
        expect(
            document.querySelector('[data-slot="spend-figures"]'),
        ).not.toBeNull(),
    )
}

describe('exporting the breakdown', () => {
    it('is a download link to the export of the view on screen, called Export CSV', async () => {
        await open()

        const link = breakdownLink()

        expect(link.tagName).toBe('A')
        expect(link).toHaveAttribute('download')
        expect(link).toHaveTextContent('Export CSV')
        expect(link).toHaveAttribute(
            'href',
            '/trail/api/usage/export?range=24h&by=model&sort=-cost',
        )
        expect(
            within(
                screen
                    .getByRole('heading', { name: 'Usage breakdown' })
                    .closest('[data-slot="panel"]') as HTMLElement,
            ).getByRole('link', { name: /Export/ }),
        ).toBe(link)
    })

    it('carries the range, the grouping and the sort of the address, and not the page', async () => {
        await open('/usage?range=7d&by=agent&sort=name&page=1')

        expect(breakdownLink('top-level agent')).toHaveAttribute(
            'href',
            '/trail/api/usage/export?range=7d&by=agent&sort=name',
        )
    })

    it('carries an hour range and a provider grouping', async () => {
        await open('/usage?range=1h&by=provider&sort=-tokens')

        expect(breakdownLink('provider')).toHaveAttribute(
            'href',
            '/trail/api/usage/export?range=1h&by=provider&sort=-tokens',
        )
    })

    it('follows the grouping tab and the sort the person chooses, and says what it exports', async () => {
        await open()

        await userEvent.click(tab('By top-level agent'))
        await rowsLoaded()

        expect(breakdownLink('top-level agent')).toHaveAttribute(
            'href',
            '/trail/api/usage/export?range=24h&by=agent&sort=-cost',
        )
        expect(
            screen.queryByRole('link', {
                name: 'Export the breakdown by model as CSV',
            }),
        ).toBeNull()

        await userEvent.click(sortButton('Runs'))
        await rowsLoaded()

        const href = breakdownLink('top-level agent').getAttribute('href') ?? ''

        expect(href).toMatch(
            /^\/trail\/api\/usage\/export\?range=24h&by=agent&sort=-?runs$/,
        )
        expect(href).not.toContain('page=')
    })

    it('follows the time range', async () => {
        await open()

        await userEvent.click(
            screen.getByRole('combobox', { name: 'Time range' }),
        )
        await userEvent.click(screen.getByRole('option', { name: 'Last hour' }))

        await waitFor(() =>
            expect(breakdownLink()).toHaveAttribute(
                'href',
                '/trail/api/usage/export?range=1h&by=model&sort=-cost',
            ),
        )
    })
})

describe('exporting the estimated cost', () => {
    it('is a download link to the export of the page’s range, called Export CSV', async () => {
        await open()

        const link = spendLink()

        expect(link.tagName).toBe('A')
        expect(link).toHaveAttribute('download')
        expect(link).toHaveTextContent('Export CSV')
        expect(link).toHaveAttribute(
            'href',
            '/trail/api/usage/spend/export?range=24h',
        )
        expect(
            within(
                screen
                    .getByRole('heading', {
                        level: 2,
                        name: 'Estimated cost over time',
                    })
                    .closest('[data-slot="panel"]') as HTMLElement,
            ).getByRole('link', { name: /Export/ }),
        ).toBe(link)
    })

    it.each(['1h', '7d'])('carries the %s range', async (range) => {
        await open(`/usage?range=${range}`)

        expect(spendLink()).toHaveAttribute(
            'href',
            `/trail/api/usage/spend/export?range=${range}`,
        )
    })

    it('does not carry the breakdown’s grouping, sort or page', async () => {
        await open('/usage?range=7d&by=agent&sort=name')

        expect(spendLink()).toHaveAttribute(
            'href',
            '/trail/api/usage/spend/export?range=7d',
        )
    })
})
