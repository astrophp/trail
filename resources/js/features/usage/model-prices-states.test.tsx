import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { priceKeys } from '@/api/prices'
import { testQueryClient } from '@/test/render-app'
import {
    deferred,
    json,
    listOf,
    listed,
    mockPrices,
    priceReads,
    pricesFixture,
    renderPrices,
    tableLoaded,
} from '@/test/prices-api'

const seenNames = [
    'openai mystery',
    'anthropic claude-sonnet-4-5',
    'anthropic claude-sonnet-4-5-20250929',
    'openai gpt-5-2025-08-07',
]

describe('the states of the price list', () => {
    it('is loading until the list is in', async () => {
        const first = deferred()
        const fetchMock = mockPrices()
        fetchMock.mockImplementationOnce(() => first.promise)
        renderPrices()

        expect(await screen.findByText('Loading')).toBeInTheDocument()
        expect(screen.queryByRole('table')).not.toBeInTheDocument()
        expect(priceReads(fetchMock)).toHaveLength(1)

        first.resolve(new Response(JSON.stringify(pricesFixture)))

        await tableLoaded()
        expect(screen.queryByText('Loading')).not.toBeInTheDocument()
    })

    it('says it failed and tries again, keeping focus on the button through the retry', async () => {
        const user = userEvent.setup()
        const fetchMock = mockPrices()
        fetchMock.mockImplementationOnce(() => json({ message: 'no' }, 500))
        renderPrices()

        const retry = await screen.findByRole('button', { name: 'Try again' })

        expect(
            screen.getByText('The model prices could not be loaded'),
        ).toBeVisible()

        const second = deferred()
        fetchMock.mockImplementationOnce(() => second.promise)
        await user.click(retry)
        await waitFor(() => expect(priceReads(fetchMock)).toHaveLength(2))

        expect(screen.getByRole('button', { name: 'Try again' })).toHaveFocus()

        second.resolve(new Response(JSON.stringify(pricesFixture)))

        await tableLoaded()
        expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
    })

    it('says so when there are no models at all', async () => {
        mockPrices(() => listOf([]))
        renderPrices()

        expect(await screen.findByText('No models yet')).toBeVisible()
        expect(screen.queryByRole('table')).not.toBeInTheDocument()
        expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    })

    it('keeps the list and says so when a later read fails, then recovers with focus kept', async () => {
        const user = userEvent.setup()
        const client = testQueryClient()
        const fetchMock = mockPrices()
        renderPrices({ client })
        await tableLoaded()

        fetchMock.mockImplementationOnce(() => json({ message: 'no' }, 500))
        await act(() => client.invalidateQueries({ queryKey: priceKeys.list }))

        const retry = await screen.findByRole('button', { name: 'Try again' })

        expect(screen.getByText(/The last refresh failed/)).toBeVisible()
        expect(listed()).toEqual(seenNames)

        await user.click(retry)

        await waitFor(() =>
            expect(
                screen.queryByText(/The last refresh failed/),
            ).not.toBeInTheDocument(),
        )
        expect(listed()).toEqual(seenNames)
        expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
    })
})
