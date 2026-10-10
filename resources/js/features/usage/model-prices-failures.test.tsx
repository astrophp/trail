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
import { notify } from '@/components/patterns/notify'
import { until } from '@/test/wait'
import {
    deferred,
    editButton,
    expectNotEditing,
    fieldOf,
    formOf,
    json,
    listOf,
    mockPrices,
    priceFixture,
    priceReads,
    priceServer,
    priceWrites,
    pricesFixture,
    renderPrices,
    resetTo,
    sonnetDated,
    tableLoaded,
    gpt5,
    gpt5Mini,
} from '@/test/prices-api'

const tooMany = 'The input rate must have at most 6 decimal places.'
const tooBig = 'The cache write rate must not be above 999999.999999.'

let success: MockInstance<typeof notify.success>
let failure: MockInstance<typeof notify.error>

beforeEach(() => {
    success = vi.spyOn(notify, 'success')
    failure = vi.spyOn(notify, 'error')
})

afterEach(() => {
    success.mockRestore()
    failure.mockRestore()
})

const save = () =>
    within(formOf(sonnetDated)).getByRole('button', { name: 'Save' })

/** The row's editor open with a rate that is too long typed in, and Save pressed. */
async function trySaving(user: ReturnType<typeof userEvent.setup>) {
    await user.click(editButton(sonnetDated))
    await user.clear(fieldOf(sonnetDated, 'Input'))
    await user.type(fieldOf(sonnetDated, 'Input'), '0.1234567')
    await user.click(save())
}

/** The one alert of the row's form that is about the row, not a field. */
const rowMessage = () =>
    within(formOf(sonnetDated))
        .getAllByRole('alert')
        .map((alert) => alert.textContent)

describe('a save the server refuses as invalid', () => {
    function refuse(errors: Record<string, string[]>) {
        return mockPrices(
            () => pricesFixture,
            () => json({ message: 'The given data was invalid.', errors }, 422),
        )
    }

    it('shows each field’s message beside it, keeps what was typed, and puts focus on the first field with a message', async () => {
        const user = userEvent.setup()
        refuse({ input: [tooMany], cache_write: [tooBig] })
        renderPrices()
        await tableLoaded()

        await trySaving(user)

        await waitFor(() => expect(fieldOf(sonnetDated, 'Input')).toHaveFocus())

        expect(fieldOf(sonnetDated, 'Input')).toHaveAccessibleDescription(
            tooMany,
        )
        expect(fieldOf(sonnetDated, 'Cache write')).toHaveAccessibleDescription(
            tooBig,
        )
        expect(fieldOf(sonnetDated, 'Input')).toBeInvalid()
        expect(fieldOf(sonnetDated, 'Output')).toBeValid()
        expect(fieldOf(sonnetDated, 'Input')).toHaveValue('0.1234567')
        expect(fieldOf(sonnetDated, 'Cache write')).toHaveValue('3.75')
        expect(rowMessage()).toEqual([tooMany, tooBig])
        expect(save()).toBeEnabled()
        expect(success).not.toHaveBeenCalled()
    })

    it('puts focus on the first field with a message, whichever it is', async () => {
        const user = userEvent.setup()
        refuse({ cache_read: ['Not a number.'] })
        renderPrices()
        await tableLoaded()

        await trySaving(user)

        await waitFor(() =>
            expect(fieldOf(sonnetDated, 'Cache read')).toHaveFocus(),
        )
    })

    it('takes a field’s message away when that field is typed in, and only that one’s', async () => {
        const user = userEvent.setup()
        refuse({ input: [tooMany], cache_write: [tooBig] })
        renderPrices()
        await tableLoaded()

        await trySaving(user)
        await waitFor(() => expect(fieldOf(sonnetDated, 'Input')).toHaveFocus())
        await user.type(fieldOf(sonnetDated, 'Input'), '{Backspace}')

        expect(fieldOf(sonnetDated, 'Input')).toBeValid()
        expect(fieldOf(sonnetDated, 'Cache write')).toBeInvalid()
        expect(rowMessage()).toEqual([tooBig])
    })

    it('shows a message about the model as the row’s own, and keeps what was typed', async () => {
        const user = userEvent.setup()
        const spelling =
            'A price is already saved under the spelling "Claude-Sonnet-4-5-20250929".'
        refuse({ model: [spelling] })
        renderPrices()
        await tableLoaded()

        await trySaving(user)

        await waitFor(() => expect(fieldOf(sonnetDated, 'Input')).toHaveFocus())

        expect(rowMessage()).toEqual([spelling])
        expect(fieldOf(sonnetDated, 'Input')).toBeValid()
        expect(fieldOf(sonnetDated, 'Input')).toHaveValue('0.1234567')
    })

    it('reads a message that is a bare text as the field’s message', async () => {
        const user = userEvent.setup()
        refuse({ input: tooMany as unknown as string[] })
        renderPrices()
        await tableLoaded()

        await trySaving(user)

        await waitFor(() =>
            expect(fieldOf(sonnetDated, 'Input')).toHaveAccessibleDescription(
                tooMany,
            ),
        )
        expect(save()).toBeEnabled()
    })

    it('falls back to the response’s message when a value is not texts, and leaves the busy state', async () => {
        const user = userEvent.setup()
        refuse({ input: { places: 6 } as unknown as string[] })
        renderPrices()
        await tableLoaded()

        await trySaving(user)

        await waitFor(() =>
            expect(rowMessage()).toEqual(['The given data was invalid.']),
        )
        expect(save()).toBeEnabled()
        expect(fieldOf(sonnetDated, 'Input')).toBeEnabled()
        expect(fieldOf(sonnetDated, 'Input')).toHaveValue('0.1234567')
    })

    it('shows a message about the body as the row’s own', async () => {
        const user = userEvent.setup()
        refuse({ body: ['The body must be a JSON object.'] })
        renderPrices()
        await tableLoaded()

        await trySaving(user)

        await waitFor(() =>
            expect(rowMessage()).toEqual(['The body must be a JSON object.']),
        )
        expect(fieldOf(sonnetDated, 'Input')).toHaveValue('0.1234567')
    })

    it('says what the server said when it names nothing the form has', async () => {
        const user = userEvent.setup()
        mockPrices(
            () => pricesFixture,
            () => json({ message: 'Something is off.' }, 422),
        )
        renderPrices()
        await tableLoaded()

        await trySaving(user)

        await waitFor(() =>
            expect(rowMessage()).toEqual([
                'The price was not saved. Something is off.',
            ]),
        )
    })
})

describe('a save the page cannot make', () => {
    it.each([
        [
            'the session has expired',
            419,
            'Your session has expired, so the price was not saved. Reload the page to continue.',
        ],
        [
            'the person may not change prices',
            403,
            'You are not allowed to change prices, so the price was not saved.',
        ],
    ])('says %s, and keeps what was typed', async (_, status, message) => {
        const user = userEvent.setup()
        mockPrices(
            () => pricesFixture,
            () => json({ message: 'refused' }, status),
        )
        renderPrices()
        await tableLoaded()

        await trySaving(user)

        await waitFor(() => expect(rowMessage()).toEqual([message]))

        expect(fieldOf(sonnetDated, 'Input')).toHaveFocus()
        expect(fieldOf(sonnetDated, 'Input')).toHaveValue('0.1234567')
        expect(save()).toBeEnabled()
        expect(
            within(formOf(sonnetDated)).queryByRole('button', {
                name: 'Try again',
            }),
        ).not.toBeInTheDocument()
    })

    it('says the model is no longer listed, tells so in a toast, and reads the list again', async () => {
        const user = userEvent.setup()
        const server = priceServer()
        renderPrices()
        await tableLoaded()
        // The refusal, then a read that is held until the test has looked at the row.
        const read = deferred()
        server.fetchMock.mockImplementationOnce(() =>
            json({ message: 'Not found.' }, 404),
        )
        server.fetchMock.mockImplementationOnce(() => read.promise)

        await trySaving(user)

        await waitFor(() =>
            expect(rowMessage()).toEqual([
                'This model is no longer listed, so its price was not saved.',
            ]),
        )
        expect(failure).toHaveBeenCalledWith(
            'anthropic claude-sonnet-4-5-20250929 is no longer listed. Its price was not saved.',
        )

        await until(() => expect(priceReads(server.fetchMock)).toHaveLength(2))

        // The model is gone when the list is read: its row, its form and its Edit button with it.
        read.resolve(
            new Response(
                JSON.stringify(
                    listOf(pricesFixture.data.filter((p) => p !== sonnetDated)),
                ),
            ),
        )

        await waitFor(() =>
            expect(
                screen.queryByRole('form', {
                    name: 'Edit the price of anthropic claude-sonnet-4-5-20250929',
                }),
            ).not.toBeInTheDocument(),
        )
        expect(
            screen.getByRole('button', {
                name: 'Edit the price of anthropic claude-sonnet-4-5',
            }),
        ).toBeVisible()
    })

    it('says the server could not be reached and offers to try again, with the same rates', async () => {
        const user = userEvent.setup()
        const fetchMock = mockPrices()
        renderPrices()
        await tableLoaded()
        fetchMock.mockImplementationOnce(() =>
            Promise.reject(new TypeError('Failed to fetch')),
        )

        await trySaving(user)

        await waitFor(() =>
            expect(rowMessage()).toEqual([
                'The server could not be reached, so the price was not saved.',
            ]),
        )
        expect(fieldOf(sonnetDated, 'Input')).toHaveFocus()
        expect(fieldOf(sonnetDated, 'Input')).toHaveValue('0.1234567')

        fetchMock.mockImplementationOnce(() => json(priceFixture))
        await user.click(
            within(formOf(sonnetDated)).getByRole('button', {
                name: 'Try again',
            }),
        )

        await waitFor(() => expectNotEditing(sonnetDated))

        const writes = priceWrites(fetchMock)

        expect(writes).toHaveLength(2)
        expect(writes[1]?.body).toEqual(writes[0]?.body)
        expect(writes[0]?.body).toMatchObject({ input: '0.1234567' })
        expect(editButton(sonnetDated)).toHaveFocus()
    })

    it('says an unexpected answer in the row, with the status, and offers to try again', async () => {
        const user = userEvent.setup()
        mockPrices(
            () => pricesFixture,
            () => json({ message: 'Server Error' }, 500),
        )
        renderPrices()
        await tableLoaded()

        await trySaving(user)

        await waitFor(() =>
            expect(rowMessage()).toEqual([
                'The price was not saved. The server answered with an error (500).',
            ]),
        )
        expect(
            within(formOf(sonnetDated)).getByRole('button', {
                name: 'Try again',
            }),
        ).toBeVisible()
    })
})

describe('text that is not a number', () => {
    it.each(['abc', '-1', '1e3', '.5', '1,5'])(
        'is refused by the form before anything is sent: %j',
        async (text) => {
            const user = userEvent.setup()
            const fetchMock = mockPrices()
            renderPrices()
            await tableLoaded()

            await user.click(editButton(sonnetDated))
            await user.clear(fieldOf(sonnetDated, 'Output'))
            await user.type(fieldOf(sonnetDated, 'Output'), text)
            await user.click(save())

            await waitFor(() =>
                expect(fieldOf(sonnetDated, 'Output')).toHaveFocus(),
            )

            expect(fieldOf(sonnetDated, 'Output')).toHaveAccessibleDescription(
                'Enter a plain number such as 3.75, or leave it blank.',
            )
            expect(fieldOf(sonnetDated, 'Output')).toHaveValue(text)
            expect(priceWrites(fetchMock)).toEqual([])
        },
    )
})

describe('a reset that fails', () => {
    it('says so in the row and offers to try the reset again', async () => {
        const user = userEvent.setup()
        const server = priceServer(listOf([gpt5, gpt5Mini]).data)
        renderPrices({ search: '?prices=all' })
        await tableLoaded()
        server.fetchMock.mockImplementationOnce(() =>
            Promise.reject(new TypeError('Failed to fetch')),
        )

        await user.click(editButton(gpt5))
        await user.click(
            within(formOf(gpt5)).getByRole('button', {
                name: 'Reset to config',
            }),
        )

        await waitFor(() =>
            expect(
                within(formOf(gpt5))
                    .getAllByRole('alert')
                    .map((alert) => alert.textContent),
            ).toEqual([
                'The server could not be reached, so the price was not reset.',
            ]),
        )

        server.answers(resetTo(gpt5))
        await user.click(
            within(formOf(gpt5)).getByRole('button', { name: 'Try again' }),
        )

        await waitFor(() => expectNotEditing(gpt5))
        expect(priceWrites(server.fetchMock).map((c) => c.method)).toEqual([
            'DELETE',
            'DELETE',
        ])
    })
})
