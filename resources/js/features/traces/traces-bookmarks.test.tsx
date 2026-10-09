import { act, screen, waitFor, within } from '@testing-library/react'
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
import { renderApp, testQueryClient } from '@/test/render-app'
import {
    bookmarkCalls,
    bookmarkServer,
    deferred,
    json,
    loaded,
    mockApi,
    traceFixture,
    traceUrls,
} from '@/test/traces-api'

const completed = '0199c2f4-6a1e-7c3b-9a55-0e8a4c1d2f30'
const failed = 'trace-failed'

// The name does not change with the state: `aria-pressed` carries it.
const completedName = 'Bookmark SupportAssistant 0199c2f4…2f30'
const failedName = `Bookmark SupportAssistant ${failed}`

const toggle = (name: string) => screen.getByRole('button', { name })
const pressed = (name: string) => toggle(name).getAttribute('aria-pressed')
const toastText = 'The bookmark could not be saved.'
const put = `PUT /trail/api/traces/${failed}/bookmark`
const del = `DELETE /trail/api/traces/${failed}/bookmark`

// The toasts live in a store that outlasts a test, so most tests ask `notify` what it was told.
let error: MockInstance<typeof notify.error>

beforeEach(() => {
    // The API client reads the CSRF token from the page's boot object.
    window.Trail = {
        path: '/trail',
        apiPath: '/trail/api',
        csrfToken: 'csrf-1',
    }
    error = vi.spyOn(notify, 'error')
    mockApi()
})

afterEach(() => {
    delete window.Trail
    error.mockRestore()
})

/** A server that keeps bookmarks, with writes that `writes` may hold back or fail. */
function serve(
    initial: string[],
    writes: (
        call: number,
        init?: RequestInit,
    ) => Promise<Response> | null = () => null,
) {
    const server = bookmarkServer(initial)
    let call = 0
    const fetchMock = mockApi(
        (url) => server.list(url),
        (url, init) => writes((call += 1), init) ?? server.write(url, init),
    )

    return { server, fetchMock }
}

describe('the bookmark button of a row', () => {
    it('has one name per run whatever the state, and `aria-pressed` for the state', async () => {
        serve([completed])
        renderApp('/traces')
        await loaded()

        expect(pressed(completedName)).toBe('true')
        expect(pressed(failedName)).toBe('false')

        await userEvent.click(toggle(failedName))

        expect(pressed(failedName)).toBe('true')
        expect(
            screen.queryByRole('button', { name: /Remove bookmark/ }),
        ).not.toBeInTheDocument()
    })

    it('has a name that is different on every row', async () => {
        renderApp('/traces')
        await loaded()

        const names = screen
            .getAllByRole('button', { name: /^Bookmark / })
            .filter((b) => b.getAttribute('aria-pressed') !== null)
            .map((b) => b.getAttribute('aria-label'))

        expect(names).toHaveLength(traceFixture.data.length)
        // "trace-running-bare" and "trace-running-priced" share a name: the id tells them apart.
        expect(new Set(names).size).toBe(names.length)
    })

    it('is the last cell of its row, apart from the checkbox, and not in the Run cell', async () => {
        renderApp('/traces')
        await loaded()

        const button = toggle(failedName)
        const row = button.closest('tr') as HTMLElement
        const cells = within(row).getAllByRole('cell')
        const runCell = within(row).getByRole('rowheader')

        // Present in the last cell, and absent from the Run cell that holds the checkbox.
        expect(cells.at(-1)).toContainElement(button)
        expect(
            within(runCell).queryByRole('button', { name: failedName }),
        ).not.toBeInTheDocument()
        expect(
            within(runCell).getByRole('checkbox', { name: /^Select / }),
        ).toBeInTheDocument()
        expect(
            within(runCell).queryByRole('button', { name: /^Bookmark / }),
        ).not.toBeInTheDocument()
    })

    it('has a column named Bookmark, which cannot be sorted', async () => {
        renderApp('/traces')
        await loaded()

        const header = screen.getByRole('columnheader', { name: 'Bookmark' })

        expect(header).not.toHaveAttribute('aria-sort')
        expect(within(header).queryByRole('button')).not.toBeInTheDocument()
        // It is the last column, as its cells are.
        expect(screen.getAllByRole('columnheader').at(-1)).toBe(header)
    })

    it('comes after the checkbox and the link of its row when tabbing, as it does on screen', async () => {
        renderApp('/traces')
        await loaded()

        const row = toggle(failedName).closest('tr') as HTMLElement
        const link = within(row).getByRole('link', { name: 'SupportAssistant' })
        const checkbox = within(row).getByRole('checkbox')

        checkbox.focus()
        await userEvent.tab()
        expect(link).toHaveFocus()
        await userEvent.tab()
        expect(toggle(failedName)).toHaveFocus()
    })

    it('does not select the row or open it when pressed', async () => {
        serve([])
        renderApp('/traces')
        await loaded()

        await userEvent.click(toggle(failedName))

        expect(pressed(failedName)).toBe('true')
        expect(
            screen.queryAllByRole('checkbox', { checked: true }),
        ).toHaveLength(0)
        // Still on the list: no run page was opened.
        expect(
            screen.getByRole('table', { name: 'Recorded runs' }),
        ).toBeVisible()
    })

    it('is drawn filled when bookmarked and as an outline when not', async () => {
        serve([completed])
        renderApp('/traces')
        await loaded()

        expect(toggle(completedName).querySelector('svg')).toHaveAttribute(
            'fill',
            'currentColor',
        )
        expect(toggle(failedName).querySelector('svg')).toHaveAttribute(
            'fill',
            'none',
        )
    })

    it('shows the bookmark at once, while the request is still pending, and keeps it on success', async () => {
        const hold = deferred()
        const { server, fetchMock } = serve([], () => hold.promise)
        renderApp('/traces')
        await loaded()

        await userEvent.click(toggle(failedName))

        expect(pressed(failedName)).toBe('true')
        await waitFor(() => expect(bookmarkCalls(fetchMock)).toEqual([put]))
        expect(
            fetchMock.mock.calls.find(([url]) => url.endsWith('/bookmark'))?.[1]
                ?.headers,
        ).toMatchObject({ 'X-CSRF-TOKEN': 'csrf-1' })

        void server.write(`/trail/api/traces/${failed}/bookmark`, {
            method: 'PUT',
        })
        hold.resolve(new Response('{}'))

        await waitFor(() => expect(pressed(failedName)).toBe('true'))
        expect(error).not.toHaveBeenCalled()
    })

    it('fetches the lists again once the last write has settled, so the server has the last word', async () => {
        const { fetchMock } = serve([])
        renderApp('/traces')
        await loaded()
        const requests = traceUrls(fetchMock).length

        await userEvent.click(toggle(failedName))

        await waitFor(() =>
            expect(traceUrls(fetchMock).length).toBeGreaterThan(requests),
        )
        expect(pressed(failedName)).toBe('true')
    })

    it('removes a bookmark with DELETE', async () => {
        const { fetchMock } = serve([completed])
        renderApp('/traces')
        await loaded()

        await userEvent.click(toggle(completedName))

        expect(pressed(completedName)).toBe('false')
        await waitFor(() =>
            expect(bookmarkCalls(fetchMock)).toEqual([
                `DELETE /trail/api/traces/${completed}/bookmark`,
            ]),
        )
    })
})

describe('when a write fails', () => {
    it('goes back to the state before the press and says so, as a toast', async () => {
        serve([], () => json({ message: 'Server error.' }, 500))
        renderApp('/traces')
        await loaded()

        await userEvent.click(toggle(failedName))

        expect((await screen.findAllByText(toastText)).length).toBeGreaterThan(
            0,
        )
        await waitFor(() => expect(pressed(failedName)).toBe('false'))
    })

    it.each([
        [401, 'Your session has ended'],
        [419, 'Your session has ended'],
        [403, 'You no longer have access to this dashboard'],
    ])(
        'a %s says so for the whole dashboard, besides the toast',
        async (status, title) => {
            serve([completed], () => json({ message: 'No.' }, status))
            renderApp('/traces')
            await loaded()

            await userEvent.click(toggle(completedName))

            await waitFor(() => expect(error).toHaveBeenCalledWith(toastText))
            expect(
                await screen.findByRole('heading', { name: title }),
            ).toBeVisible()
            expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible()
        },
    )

    it('goes back when the network fails', async () => {
        serve([], () => Promise.reject(new TypeError('offline')))
        renderApp('/traces')
        await loaded()

        await userEvent.click(toggle(failedName))

        await waitFor(() => expect(error).toHaveBeenCalledWith(toastText))
        await waitFor(() => expect(pressed(failedName)).toBe('false'))
    })

    it('ends in the server’s state when two quick presses both fail', async () => {
        const first = deferred()
        const { fetchMock } = serve([], (call) =>
            call === 1 ? first.promise : json({ message: 'Down.' }, 500),
        )
        renderApp('/traces')
        await loaded()

        await userEvent.click(toggle(failedName))
        await userEvent.click(toggle(failedName))

        expect(pressed(failedName)).toBe('false')
        first.resolve(new Response('{}', { status: 500 }))

        await waitFor(() => expect(error).toHaveBeenCalledTimes(2))
        expect(bookmarkCalls(fetchMock)).toEqual([put, del])
        // The server has no bookmark: guessing "the opposite of the last press" would say there is one.
        await waitFor(() => expect(pressed(failedName)).toBe('false'))
        await waitFor(() =>
            expect(traceUrls(fetchMock).length).toBeGreaterThan(1),
        )
        expect(pressed(failedName)).toBe('false')
    })
})

describe('quick presses', () => {
    it('end in the state of the last press, sending them in order', async () => {
        const first = deferred()
        const { server, fetchMock } = serve([], (call) =>
            call === 1 ? first.promise : null,
        )
        renderApp('/traces')
        await loaded()

        await userEvent.click(toggle(failedName))
        await userEvent.click(toggle(failedName))

        expect(pressed(failedName)).toBe('false')
        expect(bookmarkCalls(fetchMock)).toEqual([put])

        // The slow first answer arrives after the second press: it must not undo it.
        void server.write(`/x/${failed}/bookmark`, { method: 'PUT' })
        first.resolve(new Response('{}'))

        await waitFor(() =>
            expect(bookmarkCalls(fetchMock)).toEqual([put, del]),
        )
        await waitFor(() => expect(pressed(failedName)).toBe('false'))
        expect(server.marked.has(failed)).toBe(false)
        expect(error).not.toHaveBeenCalled()
    })

    it('keep the last press on screen when an earlier one fails', async () => {
        const first = deferred()
        const { server } = serve([], (call) =>
            call === 1 ? first.promise : null,
        )
        renderApp('/traces')
        await loaded()

        await userEvent.click(toggle(failedName))
        await userEvent.click(toggle(failedName))
        await userEvent.click(toggle(failedName))
        first.resolve(new Response('{}', { status: 500 }))

        await waitFor(() => expect(error).toHaveBeenCalledWith(toastText))
        await waitFor(() => expect(server.marked.has(failed)).toBe(true))
        await waitFor(() => expect(pressed(failedName)).toBe('true'))
    })
})

describe('a list fetched while a write is on its way', () => {
    it('is corrected once the write has settled', async () => {
        const hold = deferred()
        const client = testQueryClient()
        const { server } = serve([], () => hold.promise)
        renderApp('/traces', {}, client)
        await loaded()

        await userEvent.click(toggle(failedName))
        expect(pressed(failedName)).toBe('true')

        // A fetch lands with the state from before the press and overwrites the optimistic row.
        await act(() =>
            client.invalidateQueries({ queryKey: ['traces', 'list'] }),
        )
        await waitFor(() => expect(pressed(failedName)).toBe('false'))

        void server.write(`/x/${failed}/bookmark`, { method: 'PUT' })
        hold.resolve(new Response('{}'))

        await waitFor(() => expect(pressed(failedName)).toBe('true'))
    })
})

describe('a press while the table shows the previous view’s rows', () => {
    it('is not taken: the rows are not the ones the new view will show, and would not update', async () => {
        const hold = deferred()
        const server = bookmarkServer([])
        const fetchMock = mockApi(
            (url) =>
                url.includes('status=failed') ? hold.promise : server.list(url),
            (url, init) => server.write(url, init),
        )
        renderApp('/traces')
        await loaded()

        await userEvent.click(screen.getByRole('tab', { name: /^Failed/ }))
        await waitFor(() =>
            expect(screen.getByRole('table')).toHaveAttribute(
                'aria-busy',
                'true',
            ),
        )

        const button = toggle(failedName)

        // Still focusable, and said to be unavailable.
        expect(button).toHaveAttribute('aria-disabled', 'true')
        expect(button).not.toBeDisabled()

        await userEvent.click(button)

        expect(pressed(failedName)).toBe('false')
        expect(bookmarkCalls(fetchMock)).toEqual([])
        expect(server.marked.size).toBe(0)

        hold.resolve(new Response(await (await server.list('/x')).text()))

        await waitFor(() =>
            expect(toggle(failedName)).not.toHaveAttribute('aria-disabled'),
        )
        await userEvent.click(toggle(failedName))
        await waitFor(() => expect(bookmarkCalls(fetchMock)).toEqual([put]))
    })
})

describe('a write still on its way when the rows go away', () => {
    it('settles without errors, and fails with the toast', async () => {
        const hold = deferred()
        const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
        const { server } = serve([], () => hold.promise)
        renderApp('/traces')
        await loaded()

        await userEvent.click(toggle(failedName))
        // The Bookmarked view does not list the run yet: its row, and its button, go away.
        await userEvent.click(
            screen.getByRole('button', { name: 'Bookmarked' }),
        )
        await waitFor(() =>
            expect(
                screen.queryByRole('button', { name: failedName }),
            ).not.toBeInTheDocument(),
        )

        hold.resolve(new Response('{}', { status: 500 }))

        await waitFor(() => expect(error).toHaveBeenCalledWith(toastText))
        expect(server.marked.has(failed)).toBe(false)
        expect(logged).not.toHaveBeenCalled()
        logged.mockRestore()
    })
})

describe('the Bookmarked filter and a bookmark that is removed', () => {
    it('keeps the row until the list is fetched again, then drops it', async () => {
        const server = bookmarkServer([completed, failed])
        // The list answers at once until the test holds it back.
        let hold: ReturnType<typeof deferred> | null = null
        const fetchMock = mockApi(
            (url) => (hold ? hold.promise : server.list(url)),
            (url, init) => server.write(url, init),
        )
        renderApp('/traces?bookmarked=1')
        await loaded()

        expect(screen.getAllByRole('row')).toHaveLength(3)
        const requests = traceUrls(fetchMock).length

        hold = deferred()
        await userEvent.click(toggle(failedName))

        // Pressed off at once, and still in the list while the list is fetched again.
        expect(pressed(failedName)).toBe('false')
        await waitFor(() =>
            expect(traceUrls(fetchMock)).toHaveLength(requests + 1),
        )
        expect(screen.getAllByRole('row')).toHaveLength(3)

        const next = await server.list('/x?bookmarked=1')
        hold.resolve(new Response(await next.text()))

        await waitFor(() =>
            expect(
                screen.queryByRole('button', { name: failedName }),
            ).not.toBeInTheDocument(),
        )
        expect(screen.getAllByRole('row')).toHaveLength(2)
        expect(pressed(completedName)).toBe('true')
    })
})
