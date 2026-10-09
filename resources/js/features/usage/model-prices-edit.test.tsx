import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
    type MockInstance,
} from 'vitest'
import type { Price } from '@/api/types'
import { notify } from '@/components/patterns/notify'
import { until } from '@/test/wait'
import {
    cellOf,
    editButton,
    expectNotEditing,
    fieldOf,
    formOf,
    gpt4o,
    gpt5,
    gpt5Mini,
    gptDated,
    json,
    listOf,
    mockPrices,
    priceServer,
    mystery,
    priceCalls,
    priceFixture,
    priceReads,
    priceWrites,
    pricesFixture,
    renderPrices,
    resetTo,
    rowOf,
    savedAs,
    sonnet,
    sonnetDated,
    tableLoaded,
} from '@/test/prices-api'

const rates = ['Input', 'Output', 'Cache read', 'Cache write'] as const

/** What the four fields of a model say, in order. */
const valuesOf = (price: Price) =>
    rates.map((rate) => (fieldOf(price, rate) as HTMLInputElement).value)

const saveButton = (price: Price) =>
    within(formOf(price)).getByRole('button', { name: 'Save' })

/** Replaces what a field says. */
async function type(
    user: ReturnType<typeof userEvent.setup>,
    price: Price,
    rate: (typeof rates)[number],
    text: string,
) {
    await user.clear(fieldOf(price, rate))

    if (text !== '') {
        await user.type(fieldOf(price, rate), text)
    }
}

let success: MockInstance<typeof notify.success>

beforeEach(() => {
    success = vi.spyOn(notify, 'success')
})

afterEach(() => {
    success.mockRestore()
})

describe('starting to edit', () => {
    it.each([
        ['a model from the config', sonnet, ['3', '15', '0.3', '3.75']],
        [
            'a model priced through a config id',
            sonnetDated,
            ['3', '15', '0.3', '3.75'],
        ],
        ['a model priced through a saved id', gptDated, ['1', '8', '', '']],
        ['a model that has no rate', mystery, ['', '', '', '']],
        [
            'a model that is saved, with a free rate and a blank one',
            gpt5Mini,
            ['0.25', '2', '0', ''],
        ],
    ])(
        'starts %s from the rates it is priced at now',
        async (_, price, text) => {
            const user = userEvent.setup()
            mockPrices()
            renderPrices({ search: '?prices=all' })
            await tableLoaded()

            await user.click(editButton(price))

            expect(valuesOf(price)).toEqual(text)
        },
    )

    it('says that saving replaces the rates as a whole, in one sentence', async () => {
        const user = userEvent.setup()
        mockPrices()
        renderPrices()
        await tableLoaded()

        await user.click(editButton(sonnet))

        expect(
            within(formOf(sonnet)).getAllByText(
                /Saving replaces the model's rates as a whole: a blank rate means no rate, not the default one\./,
            ),
        ).toHaveLength(1)
    })

    it('opens the editor in place of the Edit button and moves focus to the first field', async () => {
        const user = userEvent.setup()
        mockPrices()
        renderPrices()
        await tableLoaded()

        await user.click(editButton(sonnet))

        expect(
            screen.queryByRole('button', {
                name: 'Edit the price of anthropic claude-sonnet-4-5',
            }),
        ).not.toBeInTheDocument()
        expect(fieldOf(sonnet, 'Input')).toHaveFocus()
        expect(
            within(formOf(sonnet)).getByRole('button', { name: 'Cancel' }),
        ).toBeVisible()
    })

    it('names each field by its rate and its model, and keeps the tab order of the screen', async () => {
        const user = userEvent.setup()
        mockPrices()
        renderPrices()
        await tableLoaded()

        await user.click(editButton(sonnet))

        expect(
            within(formOf(sonnet))
                .getAllByRole('textbox')
                .map((field) => field.getAttribute('id')),
        ).toEqual(rates.map((rate) => fieldOf(sonnet, rate).id))
        expect(
            screen.getByRole('textbox', {
                name: 'Input rate for anthropic claude-sonnet-4-5, US dollars per million tokens',
            }),
        ).toBe(fieldOf(sonnet, 'Input'))

        await user.tab()
        expect(fieldOf(sonnet, 'Output')).toHaveFocus()
        await user.tab()
        expect(fieldOf(sonnet, 'Cache read')).toHaveFocus()
        await user.tab()
        expect(fieldOf(sonnet, 'Cache write')).toHaveFocus()
        await user.tab()
        expect(saveButton(sonnet)).toHaveFocus()
        await user.tab()
        expect(
            within(formOf(sonnet)).getByRole('button', { name: 'Cancel' }),
        ).toHaveFocus()
    })

    it.each([
        ['config', gpt5, 'Reset to config'],
        ['no rate', gpt5Mini, 'Reset to no rate'],
        [
            'a shorter id',
            savedAs(sonnetDated, sonnetDated.rates),
            'Reset to claude-sonnet-4-5',
        ],
    ])(
        'offers a saved price a reset that says it returns to %s',
        async (_, price, label) => {
            const user = userEvent.setup()
            mockPrices(() => listOf([price]))
            renderPrices({ search: '?prices=all' })
            await tableLoaded()

            await user.click(editButton(price))

            expect(
                within(formOf(price)).getByRole('button', { name: label }),
            ).toBeVisible()
        },
    )

    it.each([
        ['from the config', gpt4o],
        ['through a shorter id', sonnetDated],
        ['with no rate', mystery],
    ])(
        'offers no reset for a price that is not saved: %s',
        async (_, price) => {
            const user = userEvent.setup()
            mockPrices()
            renderPrices({ search: '?prices=all' })
            await tableLoaded()

            await user.click(editButton(price))

            expect(saveButton(price)).toBeVisible()
            expect(
                within(formOf(price)).queryByRole('button', { name: /^Reset/ }),
            ).not.toBeInTheDocument()
        },
    )
})

describe('saving', () => {
    it('sends the four rates to the model in the query, with the token, and nothing else', async () => {
        const user = userEvent.setup()
        const fetchMock = mockPrices()
        renderPrices()
        await tableLoaded()

        await user.click(editButton(sonnetDated))
        await type(user, sonnetDated, 'Input', '3.50')
        await type(user, sonnetDated, 'Output', '16')
        await type(user, sonnetDated, 'Cache read', '0.35')
        await type(user, sonnetDated, 'Cache write', '')
        await user.click(saveButton(sonnetDated))

        await until(() => expect(priceWrites(fetchMock)).toHaveLength(1))

        expect(priceWrites(fetchMock)).toEqual([
            {
                method: 'PUT',
                url: '/trail/api/prices?provider=anthropic&model=claude-sonnet-4-5-20250929',
                body: {
                    input: 3.5,
                    output: 16,
                    cache_read: 0.35,
                    cache_write: null,
                },
                csrf: 'token',
            },
        ])
    })

    it('percent-encodes a provider and a model that hold a slash, a colon, a plus sign and a space', async () => {
        const user = userEvent.setup()
        const odd: Price = {
            ...gpt4o,
            provider: 'my provider/x',
            model: 'ft:gpt-4o+mini/v 1',
        }
        const fetchMock = mockPrices(
            () => listOf([odd]),
            () => json({ data: savedAs(odd, odd.rates) }),
        )
        renderPrices({ search: '?prices=all' })
        await tableLoaded()

        await user.click(editButton(odd))
        await user.click(saveButton(odd))

        await until(() => expect(priceWrites(fetchMock)).toHaveLength(1))

        expect(priceWrites(fetchMock).map((call) => call.url)).toEqual([
            '/trail/api/prices?provider=my%20provider%2Fx&model=ft%3Agpt-4o%2Bmini%2Fv%201',
        ])
    })

    it('sends a blank rate as null and a zero as 0, never one for the other', async () => {
        const user = userEvent.setup()
        const fetchMock = mockPrices()
        renderPrices({ search: '?prices=all' })
        await tableLoaded()

        await user.click(editButton(gpt4o))
        await type(user, gpt4o, 'Input', '')
        await type(user, gpt4o, 'Cache read', '0')
        await user.click(saveButton(gpt4o))

        await until(() => expect(priceWrites(fetchMock)).toHaveLength(1))

        expect(priceWrites(fetchMock)[0]?.body).toEqual({
            input: null,
            output: 10,
            cache_read: 0,
            cache_write: null,
        })
    })

    it('sends the pre-filled rates of a model that is not saved yet when nothing is changed', async () => {
        const user = userEvent.setup()
        const fetchMock = mockPrices()
        renderPrices()
        await tableLoaded()

        await user.click(editButton(sonnet))
        await user.click(saveButton(sonnet))

        await until(() => expect(priceWrites(fetchMock)).toHaveLength(1))

        expect(priceWrites(fetchMock)[0]?.body).toEqual(sonnet.rates)
    })

    it('saves with Enter in a field', async () => {
        const user = userEvent.setup()
        const fetchMock = mockPrices()
        renderPrices()
        await tableLoaded()

        await user.click(editButton(sonnet))
        await user.type(fieldOf(sonnet, 'Input'), '{Enter}')

        await until(() => expect(priceWrites(fetchMock)).toHaveLength(1))
    })

    it('leaves the editor with the price the server answered, says so, and reads the list again', async () => {
        const user = userEvent.setup()
        const { fetchMock, answers } = priceServer()
        answers(priceFixture.data)
        renderPrices()
        await tableLoaded()

        await user.click(editButton(sonnetDated))
        await type(user, sonnetDated, 'Input', '3.50')
        await user.click(saveButton(sonnetDated))

        await waitFor(() => expectNotEditing(sonnetDated))

        const row = rowOf(sonnetDated)

        // The answer, not what was typed: the contract's saved price has these rates.
        expect(priceFixture.data.rates.input).toBe(3.5)
        expect(cellOf(row, 'input')).toHaveTextContent(/^3.5$/)
        expect(cellOf(row, 'output')).toHaveTextContent(/^16$/)
        expect(cellOf(row, 'cache_read')).toHaveTextContent(/^0.35$/)
        expect(cellOf(row, 'cache_write')).toHaveTextContent(/^—No rate$/)
        expect(cellOf(row, 'source')).toHaveTextContent(
            'SavedJan 2, 2026, 12:00:00 GMT',
        )
        expect(success).toHaveBeenCalledTimes(1)
        expect(success).toHaveBeenCalledWith(
            'Saved the price of anthropic claude-sonnet-4-5-20250929.',
        )

        await until(() => expect(priceReads(fetchMock)).toHaveLength(2))
    })

    it('returns focus to the row’s Edit button', async () => {
        const user = userEvent.setup()
        mockPrices()
        renderPrices()
        await tableLoaded()

        await user.click(editButton(sonnetDated))
        await user.click(saveButton(sonnetDated))

        await waitFor(() => expect(editButton(sonnetDated)).toHaveFocus())
    })

    it('disables the controls of the row while it saves, and no others', async () => {
        const user = userEvent.setup()
        let release: (response: Response) => void = () => {}
        const held = new Promise<Response>((resolve) => {
            release = resolve
        })
        const fetchMock = mockPrices(
            () => pricesFixture,
            () => held,
        )
        renderPrices()
        await tableLoaded()

        await user.click(editButton(sonnet))
        await user.click(editButton(sonnetDated))
        await user.click(saveButton(sonnetDated))
        await until(() => expect(priceWrites(fetchMock)).toHaveLength(1))

        for (const rate of rates) {
            expect(fieldOf(sonnetDated, rate)).toBeDisabled()
            expect(fieldOf(sonnet, rate)).toBeEnabled()
        }

        expect(
            within(formOf(sonnetDated)).getByRole('button', {
                name: 'Saving…',
            }),
        ).toBeDisabled()
        expect(
            within(formOf(sonnetDated)).getByRole('button', { name: 'Cancel' }),
        ).toBeDisabled()
        expect(saveButton(sonnet)).toBeEnabled()

        release(new Response(JSON.stringify(priceFixture)))

        await waitFor(() => expectNotEditing(sonnetDated))
        expect(fieldOf(sonnet, 'Input')).toBeEnabled()
    })

    it('does not save twice when pressed twice', async () => {
        const user = userEvent.setup()
        const fetchMock = mockPrices(
            () => pricesFixture,
            () => new Promise<Response>(() => {}),
        )
        renderPrices()
        await tableLoaded()

        await user.click(editButton(sonnet))
        await user.click(saveButton(sonnet))
        await until(() => expect(priceWrites(fetchMock)).toHaveLength(1))
        await user.type(fieldOf(sonnet, 'Input'), '{Enter}')
        await user.click(
            within(formOf(sonnet)).getByRole('button', { name: 'Saving…' }),
        )

        expect(priceWrites(fetchMock)).toHaveLength(1)
    })
})

describe('resetting', () => {
    it('removes the saved price, and the row shows what applies without it', async () => {
        const user = userEvent.setup()
        const { fetchMock, answers } = priceServer()
        answers(resetTo(gpt5))
        renderPrices({ search: '?prices=all' })
        await tableLoaded()

        await user.click(editButton(gpt5))
        await user.click(
            within(formOf(gpt5)).getByRole('button', {
                name: 'Reset to config',
            }),
        )

        await waitFor(() => expectNotEditing(gpt5))

        expect(priceWrites(fetchMock)).toEqual([
            {
                method: 'DELETE',
                url: '/trail/api/prices?provider=openai&model=gpt-5',
                body: undefined,
                csrf: 'token',
            },
        ])

        const row = rowOf(gpt5)

        expect(cellOf(row, 'source')).toHaveTextContent(/^Config$/)
        expect(cellOf(row, 'input')).toHaveTextContent(/^1.25$/)
        expect(cellOf(row, 'output')).toHaveTextContent(/^10$/)
        expect(cellOf(row, 'cache_read')).toHaveTextContent(/^0.125$/)
        expect(success).toHaveBeenCalledWith('Reset the price of openai gpt-5.')
        await until(() => expect(priceReads(fetchMock)).toHaveLength(2))
        expect(editButton(gpt5)).toHaveFocus()
    })

    it('returns a model whose default is no rate to a row that says No rate, never to zeros', async () => {
        const user = userEvent.setup()
        priceServer().answers(resetTo(gpt5Mini))
        renderPrices({ search: '?prices=all' })
        await tableLoaded()

        await user.click(editButton(gpt5Mini))
        await user.click(
            within(formOf(gpt5Mini)).getByRole('button', {
                name: 'Reset to no rate',
            }),
        )
        await waitFor(() => expectNotEditing(gpt5Mini))

        const row = rowOf(gpt5Mini)

        expect(cellOf(row, 'source')).toHaveTextContent(/^No rate$/)

        for (const rate of ['input', 'output', 'cache_read', 'cache_write']) {
            expect(cellOf(row, rate)).toHaveTextContent(/^—No rate$/)
        }
    })

    it('discards what was typed in the row when it resets', async () => {
        const user = userEvent.setup()
        priceServer().answers(resetTo(gpt5))
        renderPrices({ search: '?prices=all' })
        await tableLoaded()

        await user.click(editButton(gpt5))
        await type(user, gpt5, 'Input', '99')
        await user.click(
            within(formOf(gpt5)).getByRole('button', {
                name: 'Reset to config',
            }),
        )
        await waitFor(() => expectNotEditing(gpt5))
        await user.click(editButton(gpt5))

        expect(valuesOf(gpt5)).toEqual(['1.25', '10', '0.125', ''])
    })
})

describe('cancelling', () => {
    it('discards the draft without a question, and the next edit starts from the rates again', async () => {
        const user = userEvent.setup()
        const confirm = vi.spyOn(window, 'confirm')
        const fetchMock = mockPrices()
        renderPrices()
        await tableLoaded()

        await user.click(editButton(sonnet))
        await type(user, sonnet, 'Input', '99')
        await user.click(
            within(formOf(sonnet)).getByRole('button', { name: 'Cancel' }),
        )

        expectNotEditing(sonnet)
        expect(confirm).not.toHaveBeenCalled()
        expect(priceCalls(fetchMock).filter((c) => c.method !== 'GET')).toEqual(
            [],
        )
        expect(cellOf(rowOf(sonnet), 'input')).toHaveTextContent(/^3$/)
        expect(editButton(sonnet)).toHaveFocus()

        await user.click(editButton(sonnet))

        expect(valuesOf(sonnet)).toEqual(['3', '15', '0.3', '3.75'])
        confirm.mockRestore()
    })
})
