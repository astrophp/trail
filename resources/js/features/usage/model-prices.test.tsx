import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import {
    cellOf,
    editButton,
    formOf,
    gpt4o,
    gpt5,
    gpt5Mini,
    gptDated,
    listOf,
    listed,
    mockPrices,
    mystery,
    pricesFixture,
    renderPrices,
    rowOf,
    savedAs,
    sonnet,
    sonnetDated,
    table,
    tableLoaded,
} from '@/test/prices-api'

const tab = (name: RegExp | string) => screen.getByRole('tab', { name })
const filter = () =>
    screen.getByRole('searchbox', {
        name: 'Filter the models by provider or model',
    })

/** The names the fixture lists, in the server's order. */
const seenNames = [
    'openai mystery',
    'anthropic claude-sonnet-4-5',
    'anthropic claude-sonnet-4-5-20250929',
    'openai gpt-5-2025-08-07',
]
const allNames = [
    ...seenNames,
    'openai gpt-4o',
    'openai gpt-5',
    'openai gpt-5-mini',
]

describe('the list', () => {
    it('opens on the models seen in usage, in the order the server gave', async () => {
        mockPrices()
        renderPrices()
        await tableLoaded()

        expect(tab(/^Seen in usage/)).toHaveAttribute('aria-selected', 'true')
        expect(tab(/^All models/)).toHaveAttribute('aria-selected', 'false')
        expect(listed()).toEqual(seenNames)
    })

    it('counts the models of each tab', async () => {
        mockPrices()
        renderPrices()
        await tableLoaded()

        expect(tab(/^Seen in usage/)).toHaveTextContent('4')
        expect(tab(/^All models/)).toHaveTextContent('7')
    })

    it('lists every model on All models, and the choice is in the address', async () => {
        const user = userEvent.setup()
        mockPrices()
        renderPrices()
        await tableLoaded()

        await user.click(tab(/^All models/))

        await waitFor(() => expect(listed()).toEqual(allNames))
        expect(window.location.search).toBe('?prices=all')
    })

    it('opens on All models when the address asks for them', async () => {
        mockPrices()
        renderPrices({ search: '?prices=all' })
        await tableLoaded()

        expect(tab(/^All models/)).toHaveAttribute('aria-selected', 'true')
        expect(listed()).toEqual(allNames)
    })

    it('opens on All models when no model was seen in usage', async () => {
        mockPrices(() =>
            listOf(pricesFixture.data.map((p) => ({ ...p, observed: false }))),
        )
        renderPrices()
        await tableLoaded()

        expect(tab(/^All models/)).toHaveAttribute('aria-selected', 'true')
        expect(listed()).toEqual(allNames)
    })

    it('says so on Seen in usage when nothing was seen and that tab is chosen', async () => {
        mockPrices(() =>
            listOf(pricesFixture.data.map((p) => ({ ...p, observed: false }))),
        )
        renderPrices({ search: '?prices=seen' })

        expect(
            await screen.findByText('No model has been seen in usage yet'),
        ).toBeVisible()
        expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })

    it('says in a few words where models come from, and the unit', async () => {
        mockPrices()
        renderPrices()
        await tableLoaded()

        expect(
            screen.getByText(
                'US dollars per million tokens. Models come from your Trail configuration and recorded usage.',
            ),
        ).toBeVisible()
    })

    it('says once that a price applies from now on and recorded costs stay', async () => {
        mockPrices()
        renderPrices()
        await tableLoaded()

        expect(
            screen.getAllByText(/applies to runs recorded from now on/),
        ).toHaveLength(1)
        expect(
            screen.getByText(/costs already recorded stay as they were/),
        ).toBeVisible()
        expect(
            screen.getByText(/can take up to a minute to pick it up/),
        ).toBeVisible()
    })

    it('has no way to add a model or to delete one', async () => {
        mockPrices()
        renderPrices({ search: '?prices=all' })
        await tableLoaded()

        expect(
            screen.queryByRole('button', { name: /^(add|new|delete|remove)/i }),
        ).not.toBeInTheDocument()
        expect(
            screen.getAllByRole('button', { name: /^Edit the price of / }),
        ).toHaveLength(7)
    })

    it('has the columns Model, Input, Output, Cache read, Cache write and Source', async () => {
        mockPrices()
        renderPrices()
        await tableLoaded()

        expect(
            within(table())
                .getAllByRole('columnheader')
                .map((header) => header.textContent),
        ).toEqual([
            'Model',
            'Input',
            'Output',
            'Cache read',
            'Cache write',
            'Source',
            'Actions',
        ])
    })

    it('notes that only part of the list is shown when the server cut it', async () => {
        mockPrices(() =>
            listOf(pricesFixture.data, {
                limit: 500,
                total: 1200,
                truncated: true,
            }),
        )
        renderPrices()
        await tableLoaded()

        const note = screen.getByText('Only part of the list is shown')

        expect(note).toBeVisible()
        expect(note.parentElement).toHaveTextContent(
            'Trail lists 500 of 1,200 models',
        )
    })

    it('has no such note when the list is whole', async () => {
        mockPrices()
        renderPrices()
        await tableLoaded()

        expect(listed()).toHaveLength(4)
        expect(
            screen.queryByText('Only part of the list is shown'),
        ).not.toBeInTheDocument()
    })
})

describe('the filter', () => {
    it('keeps the models that have every word in the provider or the model, whatever the case', async () => {
        const user = userEvent.setup()
        mockPrices()
        renderPrices({ search: '?prices=all' })
        await tableLoaded()

        await user.type(filter(), 'OPENAI gpt-5{Enter}')

        await waitFor(() =>
            expect(listed()).toEqual([
                'openai gpt-5-2025-08-07',
                'openai gpt-5',
                'openai gpt-5-mini',
            ]),
        )
        expect(window.location.search).toBe('?prices=all&find=OPENAI+gpt-5')
    })

    it('filters within the tab it is on', async () => {
        const user = userEvent.setup()
        mockPrices()
        renderPrices()
        await tableLoaded()

        await user.type(filter(), 'gpt{Enter}')

        await waitFor(() =>
            expect(listed()).toEqual(['openai gpt-5-2025-08-07']),
        )
    })

    it('reads the filter from the address', async () => {
        mockPrices()
        renderPrices({ search: '?prices=all&find=mini' })
        await tableLoaded()

        expect(filter()).toHaveValue('mini')
        expect(listed()).toEqual(['openai gpt-5-mini'])
    })

    it('says so when no model matches, and keeps the filter to change', async () => {
        const user = userEvent.setup()
        mockPrices()
        renderPrices()
        await tableLoaded()

        await user.type(filter(), 'nothing like this{Enter}')

        expect(
            await screen.findByText('No model matches the filter'),
        ).toBeVisible()
        expect(screen.queryByRole('table')).not.toBeInTheDocument()
        expect(filter()).toHaveValue('nothing like this')
    })
})

describe('where the rates come from', () => {
    it('shows a saved price with when it was saved, in the application time zone', async () => {
        mockPrices()
        renderPrices({ search: '?prices=all' })
        await tableLoaded()

        const source = cellOf(rowOf(gpt5), 'source')

        expect(within(source).getByText('Saved')).toBeVisible()
        expect(source).toHaveTextContent('Jan 2, 2026, 12:00:00 GMT')
    })

    it('shows a configured price as Config', async () => {
        mockPrices()
        renderPrices()
        await tableLoaded()

        expect(cellOf(rowOf(sonnet), 'source')).toHaveTextContent(/^Config$/)
    })

    it('shows a price through a configured id as that id, and says it is a config entry', async () => {
        mockPrices()
        renderPrices()
        await tableLoaded()

        expect(cellOf(rowOf(sonnetDated), 'source')).toHaveTextContent(
            'From claude-sonnet-4-5its config entry',
        )
    })

    it('shows a price through a saved id as that id, and says it is a saved price', async () => {
        mockPrices()
        renderPrices()
        await tableLoaded()

        expect(cellOf(rowOf(gptDated), 'source')).toHaveTextContent(
            'From gpt-5its saved price',
        )
    })

    it('flags a model seen in usage that has no rate: its usage shows as Unpriced', async () => {
        mockPrices()
        renderPrices()
        await tableLoaded()

        expect(cellOf(rowOf(mystery), 'source')).toHaveTextContent(
            'No rateSeen in usage, which shows as Unpriced',
        )
    })

    it('does not flag a model with no rate that was not seen in usage', async () => {
        mockPrices(() =>
            listOf([
                { ...mystery, observed: false },
                ...pricesFixture.data.slice(1),
            ]),
        )
        renderPrices({ search: '?prices=all' })
        await tableLoaded()

        const source = cellOf(rowOf(mystery), 'source')

        expect(source).toHaveTextContent(/^No rate$/)
        expect(within(source).queryByText(/Unpriced/)).not.toBeInTheDocument()
    })
})

describe('a rate that is blank and a rate that is 0', () => {
    it('shows 0 as 0 and a blank as a dash that reads as "No rate"', async () => {
        mockPrices()
        renderPrices({ search: '?prices=all' })
        await tableLoaded()

        const row = rowOf(gpt5Mini)

        expect(cellOf(row, 'cache_read')).toHaveTextContent(/^0$/)
        expect(cellOf(row, 'cache_write')).toHaveTextContent(/^—No rate$/)
        expect(cellOf(row, 'input')).toHaveTextContent(/^0.25$/)
    })

    it('shows every rate of a model with no rate as a dash, never as 0', async () => {
        mockPrices()
        renderPrices()
        await tableLoaded()

        const row = rowOf(mystery)

        for (const rate of ['input', 'output', 'cache_read', 'cache_write']) {
            expect(cellOf(row, rate)).toHaveTextContent(/^—No rate$/)
        }
    })

    it('shows a saved blank as blank, not as the config value it replaced', async () => {
        // gpt-4o is configured with a cache read; this saved price replaces it as a whole, without one.
        const saved = savedAs(gpt4o, { ...gpt4o.rates, cache_read: null })

        mockPrices(() => listOf([saved]))
        renderPrices({ search: '?prices=all' })
        await tableLoaded()

        const row = rowOf(saved)

        expect(saved.default.rates.cache_read).toBe(1.25)
        expect(cellOf(row, 'cache_read')).toHaveTextContent(/^—No rate$/)
        expect(cellOf(row, 'input')).toHaveTextContent(/^2.5$/)
    })
})

describe('the compact summary a narrow screen shows', () => {
    // jsdom applies no stylesheet, so which of the two a width shows is left to the browser;
    // what it can check is that the summary says the same things as the columns.
    it('names the four rates under the model, a free one as 0 and a blank as a dash', async () => {
        mockPrices()
        renderPrices({ search: '?prices=all' })
        await tableLoaded()

        const summary = rowOf(gpt5Mini).querySelector(
            '[data-slot="price-summary"]',
        )

        expect(summary).toHaveTextContent(
            'Input 0.25Output 2Cache read 0Cache write —No rate',
        )
    })

    it('says where the rates come from under the summary', async () => {
        mockPrices()
        renderPrices()
        await tableLoaded()

        const summary = rowOf(mystery).querySelector(
            '[data-slot="price-summary"]',
        )

        expect(summary).toHaveTextContent(
            'No rateSeen in usage, which shows as Unpriced',
        )
    })

    it('keeps one Edit button per row, and one set of four labelled fields while editing', async () => {
        const user = userEvent.setup()
        mockPrices()
        renderPrices()
        await tableLoaded()

        await user.click(editButton(mystery))

        expect(
            screen.getAllByRole('textbox', { name: /^Input rate for / }),
        ).toHaveLength(1)
        expect(within(formOf(mystery)).getAllByRole('textbox')).toHaveLength(4)
        expect(
            screen.getAllByRole('button', { name: /^Edit the price of / }),
        ).toHaveLength(3)
    })
})
