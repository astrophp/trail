import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { until } from '@/test/wait'
import {
    cellOf,
    deferred,
    editButton,
    expectNotEditing,
    fieldOf,
    formOf,
    listed,
    mystery,
    priceFixture,
    priceServer,
    priceWrites,
    pricesFixture,
    renderPrices,
    rowOf,
    sonnet,
    sonnetDated,
    tableLoaded,
} from '@/test/prices-api'

describe('several rows being edited', () => {
    it('keeps each row’s own draft, and a change in one touches no other', async () => {
        const user = userEvent.setup()
        priceServer()
        renderPrices()
        await tableLoaded()

        await user.click(editButton(sonnet))
        await user.click(editButton(sonnetDated))
        await user.click(editButton(mystery))
        await user.clear(fieldOf(sonnet, 'Input'))
        await user.type(fieldOf(sonnet, 'Input'), '11')
        await user.type(fieldOf(mystery, 'Output'), '22')

        expect(fieldOf(sonnet, 'Input')).toHaveValue('11')
        expect(fieldOf(sonnetDated, 'Input')).toHaveValue('3')
        expect(fieldOf(mystery, 'Output')).toHaveValue('22')
        expect(fieldOf(mystery, 'Input')).toHaveValue('')
        expect(screen.getAllByRole('form')).toHaveLength(3)
    })

    it('cancels one row and leaves the others as they are', async () => {
        const user = userEvent.setup()
        priceServer()
        renderPrices()
        await tableLoaded()

        await user.click(editButton(sonnet))
        await user.click(editButton(sonnetDated))
        await user.type(fieldOf(sonnet, 'Output'), '5')
        await user.click(
            within(formOf(sonnetDated)).getByRole('button', { name: 'Cancel' }),
        )

        expectNotEditing(sonnetDated)
        expect(fieldOf(sonnet, 'Output')).toHaveValue('155')
    })

    it('keeps a draft when its row is filtered out and back, and when the tab is switched', async () => {
        const user = userEvent.setup()
        priceServer()
        renderPrices()
        await tableLoaded()

        await user.click(editButton(sonnet))
        await user.type(fieldOf(sonnet, 'Input'), '5')

        await user.type(
            screen.getByRole('searchbox', {
                name: 'Filter the models by provider or model',
            }),
            'gpt{Enter}',
        )
        await waitFor(() =>
            expect(listed()).toEqual(['openai gpt-5-2025-08-07']),
        )

        await user.click(screen.getByRole('button', { name: 'Clear search' }))
        await waitFor(() =>
            expect(listed()).toContain('anthropic claude-sonnet-4-5'),
        )

        expect(fieldOf(sonnet, 'Input')).toHaveValue('35')

        await user.click(screen.getByRole('tab', { name: /^All models/ }))

        await waitFor(() => expect(listed()).toContain('openai gpt-4o'))
        expect(fieldOf(sonnet, 'Input')).toHaveValue('35')
    })
})

describe('while another row saves and the list is read again', () => {
    it('never overwrites what is being typed in a row still being edited, and updates what it only shows', async () => {
        const user = userEvent.setup()
        const server = priceServer()
        server.answers(priceFixture.data)
        renderPrices()
        await tableLoaded()

        await user.click(editButton(sonnet))
        await user.click(editButton(sonnetDated))
        await user.clear(fieldOf(sonnet, 'Input'))
        await user.type(fieldOf(sonnet, 'Input'), '77')

        // The save of the other row is held; meanwhile another process changed this row's price.
        const held = deferred()
        server.fetchMock.mockImplementationOnce(() => held.promise)
        await user.click(
            within(formOf(sonnetDated)).getByRole('button', { name: 'Save' }),
        )
        await until(() => expect(priceWrites(server.fetchMock)).toHaveLength(1))

        await user.type(fieldOf(sonnet, 'Input'), '7')

        server.set(
            pricesFixture.data.map((price) =>
                price === sonnet
                    ? { ...price, rates: { ...price.rates, input: 9 } }
                    : price === sonnetDated
                      ? priceFixture.data
                      : price,
            ),
        )
        held.resolve(new Response(JSON.stringify(priceFixture)))

        // The refetched list is in: the row that only shows has the new rate...
        await waitFor(() =>
            expect(cellOf(rowOf(sonnet), 'input')).toHaveTextContent(/^9$/),
        )

        // ...and the one being edited keeps what was typed, with the form open.
        expect(fieldOf(sonnet, 'Input')).toHaveValue('777')
        expect(fieldOf(sonnet, 'Input')).toBeEnabled()
        expectNotEditing(sonnetDated)
        expect(cellOf(rowOf(sonnetDated), 'source')).toHaveTextContent(/^Saved/)
    })

    it('has no form for a model the refreshed list no longer holds', async () => {
        const user = userEvent.setup()
        const server = priceServer()
        server.answers(priceFixture.data)
        renderPrices()
        await tableLoaded()

        await user.click(editButton(mystery))
        await user.type(fieldOf(mystery, 'Input'), '4')
        await user.click(editButton(sonnetDated))
        server.set(pricesFixture.data.filter((price) => price !== mystery))
        await user.click(
            within(formOf(sonnetDated)).getByRole('button', { name: 'Save' }),
        )

        await waitFor(() => expect(listed()).not.toContain('openai mystery'))

        expect(listed()).toContain('anthropic claude-sonnet-4-5')
        expect(
            screen.queryByRole('form', {
                name: 'Edit the price of openai mystery',
            }),
        ).not.toBeInTheDocument()
    })
})
