import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reloadPage } from '@/lib/reload-page'
import { deferred, json, mockApi, metaWith, searchBox } from '@/test/traces-api'
import { appReady, renderApp, testQueryClient } from '@/test/render-app'

vi.mock('@/lib/reload-page', () => ({ reloadPage: vi.fn() }))

const firstRun = 'Trail is recording and waiting for the first run'
const pausedTitle = 'Recording is paused'
const unreachable = 'The dashboard could not reach the application'
const ended = 'Your session has ended'
const denied = 'You no longer have access to this dashboard'
const dismissedKey = 'trail.recording-notice.dismissed'

const heading = (name: string, level = 1) =>
    screen.findByRole('heading', { level, name })
const nav = () => screen.getByRole('navigation', { name: 'Main' })
const content = () => document.getElementById('content')!
const notice = () => document.querySelector('[data-slot="notice"]')

type Mode = {
    any?: boolean
    recording?: Parameters<typeof metaWith>[0]['recording']
    /** An HTTP status to answer with, or `offline` for no response. */
    fail?: number | 'offline'
}

/** A meta endpoint whose answer a test changes between requests: set `state`, then refetch. */
function controllable(initial: Mode = {}) {
    const state: Mode = { ...initial }
    const handler = () =>
        state.fail === 'offline'
            ? Promise.reject(new TypeError('offline'))
            : state.fail !== undefined
              ? json({ message: 'No.' }, state.fail)
              : json(metaWith(state))

    return { state, handler }
}

type Client = ReturnType<typeof testQueryClient>
type Mock = ReturnType<typeof mockApi>

async function refetchMeta(client: Client) {
    await act(() => client.invalidateQueries({ queryKey: ['meta'] }))
}

const metaCalls = (fetchMock: Mock) =>
    fetchMock.mock.calls.filter(([url]) => url.includes('/api/meta')).length
const listCalls = (fetchMock: Mock) =>
    fetchMock.mock.calls.filter(([url]) => url.includes('/api/traces?')).length

/** The meta request has been made and its answer (or failure) applied. */
async function metaAnswered(fetchMock: Mock, client: Client) {
    await waitFor(() => expect(metaCalls(fetchMock)).toBeGreaterThan(0))
    await waitFor(() => expect(client.isFetching()).toBe(0))
}

beforeEach(() => {
    sessionStorage.clear()
    vi.mocked(reloadPage).mockClear()
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('first run', () => {
    it.each([
        '/',
        '/traces',
        '/agents',
        '/conversations',
        '/usage',
        '/traces/abc',
    ])(
        'replaces the page at %s with the setup screen, leaving the shell',
        async (route) => {
            mockApi(undefined, undefined, () => json(metaWith({ any: false })))
            renderApp(route)

            expect(await heading(firstRun)).toBeVisible()
            expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
            expect(
                within(nav()).getByRole('link', { name: 'Overview' }),
            ).toBeVisible()
            expect(screen.getByRole('banner')).toBeVisible()
            expect(screen.queryByRole('table')).not.toBeInTheDocument()
            expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        },
    )

    it('makes no page request before meta answers, none behind the setup screen, and starts them when the first run is in', async () => {
        const first = deferred()
        const { state, handler } = controllable({ any: false })
        let calls = 0
        const fetchMock = mockApi(undefined, undefined, () => {
            calls++

            return calls === 1 ? first.promise : handler()
        })
        const client = testQueryClient()
        renderApp('/traces', {}, client)
        await waitFor(() => expect(metaCalls(fetchMock)).toBe(1))

        // Nothing but the shell: no page, no skeleton, no setup screen.
        expect(listCalls(fetchMock)).toBe(0)
        expect(content()).toBeEmptyDOMElement()

        act(() => {
            first.resolve(
                new Response(JSON.stringify(metaWith({ any: false }))),
            )
        })
        await heading(firstRun)
        await refetchMeta(client)

        expect(listCalls(fetchMock)).toBe(0)

        state.any = true
        await refetchMeta(client)

        expect(await heading('Traces')).toBeVisible()
        await waitFor(() => expect(listCalls(fetchMock)).toBe(1))
    })

    it('renders nothing in the content area while the first meta request is pending, then the page', async () => {
        const first = deferred()
        mockApi(undefined, undefined, () => first.promise)
        renderApp('/traces')

        await screen.findByRole('banner')

        expect(content()).toBeEmptyDOMElement()
        expect(screen.queryByText(firstRun)).not.toBeInTheDocument()
        expect(screen.queryByRole('heading', { level: 1 })).toBeNull()

        act(() => {
            first.resolve(new Response(JSON.stringify(metaWith({ any: true }))))
        })

        expect(await heading('Traces')).toBeVisible()
        expect(screen.queryByText(firstRun)).not.toBeInTheDocument()
    })

    it('gives way to the page by itself, and focus is not left on the body', async () => {
        const { state, handler } = controllable({ any: false })
        mockApi(undefined, undefined, handler)
        const client = testQueryClient()
        renderApp('/traces', {}, client)
        await heading(firstRun)

        state.any = true
        await refetchMeta(client)

        const page = await heading('Traces')

        expect(screen.queryByText(firstRun)).not.toBeInTheDocument()
        await waitFor(() => expect(page).toHaveFocus())
        expect(document.body).not.toHaveFocus()
    })

    it('replaces a stale cached "no runs" with the page when Refresh brings runs', async () => {
        const { state, handler } = controllable({ any: false })
        mockApi(undefined, undefined, handler)
        renderApp('/traces')
        await heading(firstRun)

        state.any = true
        await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))

        expect(await heading('Traces')).toBeVisible()
        expect(screen.queryByText(firstRun)).not.toBeInTheDocument()
    })

    it('keeps the setup screen when the time range changes, with no flash of the page', async () => {
        const slow = deferred()
        const fetchMock = mockApi(undefined, undefined, (url) =>
            url.includes('range=7d')
                ? slow.promise
                : json(metaWith({ any: false })),
        )
        renderApp('/traces')
        await heading(firstRun)

        act(() => {
            window.history.pushState({}, '', '/trail/traces?range=7d')
            window.dispatchEvent(new PopStateEvent('popstate'))
        })

        await waitFor(() => expect(metaCalls(fetchMock)).toBe(2))
        // The new range's answer is still on its way: the last one stands in.
        expect(screen.getByText(firstRun)).toBeVisible()
        expect(screen.queryByRole('heading', { name: 'Traces' })).toBeNull()

        act(() => {
            slow.resolve(new Response(JSON.stringify(metaWith({ any: false }))))
        })
        await waitFor(() => expect(screen.getByText(firstRun)).toBeVisible())

        expect(screen.queryByRole('heading', { name: 'Traces' })).toBeNull()
        expect(listCalls(fetchMock)).toBe(0)
    })

    it('hands focus to the heading when it replaces a page that had it on a control', async () => {
        const { state, handler } = controllable()
        mockApi(undefined, undefined, handler)
        const client = testQueryClient()
        renderApp('/traces', {}, client)
        await heading('Traces')
        searchBox().focus()
        expect(searchBox()).toHaveFocus()

        state.any = false
        await refetchMeta(client)

        const title = await heading(firstRun)

        await waitFor(() => expect(title).toHaveFocus())
        expect(document.body).not.toHaveFocus()
    })

    it('says nothing is recorded until resumed when recording is paused', async () => {
        mockApi(undefined, undefined, () =>
            json(metaWith({ any: false, recording: 'paused' })),
        )
        renderApp('/')

        const title = await screen.findByRole('heading', {
            level: 1,
            name: /nothing will be recorded until it is resumed/,
        })

        expect(title).not.toHaveTextContent(/waiting/)
        expect(screen.getByText('php artisan trail:resume')).toBeVisible()
        // The paused notice is for a dashboard that has data.
        expect(screen.queryByText(pausedTitle)).not.toBeInTheDocument()
    })
})

describe('recording paused', () => {
    const paused = () => json(metaWith({ recording: 'paused' }))
    const noticeText = () => screen.queryByText(pausedTitle)

    it('shows a notice above the page, with how to resume', async () => {
        mockApi(undefined, undefined, paused)
        renderApp('/traces')

        const title = await screen.findByText(pausedTitle)
        const box = title.closest('[data-slot="notice"]') as HTMLElement

        expect(box).toHaveAttribute('data-tone', 'warning')
        expect(within(box).getByText('php artisan trail:resume')).toBeVisible()
        expect(box).toHaveTextContent(/nothing new is being recorded/i)
        expect(await heading('Traces')).toBeVisible()
    })

    it('is on every page', async () => {
        mockApi(undefined, undefined, paused)
        renderApp('/agents')
        await screen.findByText(pausedTitle)

        await userEvent.click(
            within(nav()).getByRole('link', { name: 'Overview' }),
        )

        expect(await heading('Overview')).toBeVisible()
        expect(noticeText()).toBeVisible()
    })

    it('can be dismissed; that survives a refetch and a navigation', async () => {
        mockApi(undefined, undefined, paused)
        const client = testQueryClient()
        renderApp('/agents', {}, client)
        await screen.findByText(pausedTitle)

        await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

        expect(noticeText()).not.toBeInTheDocument()
        expect(sessionStorage.getItem(dismissedKey)).toBe('1')

        await refetchMeta(client)
        await userEvent.click(
            within(nav()).getByRole('link', { name: 'Overview' }),
        )
        await heading('Overview')

        expect(noticeText()).not.toBeInTheDocument()
    })

    it('hands focus to the page heading when the dismiss button goes', async () => {
        mockApi(undefined, undefined, paused)
        renderApp('/agents')
        await screen.findByText(pausedTitle)

        screen.getByRole('button', { name: 'Dismiss' }).focus()
        await userEvent.keyboard('{Enter}')

        expect(noticeText()).not.toBeInTheDocument()
        expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
    })

    it('stays dismissed in the same session, comes back in a new one', async () => {
        mockApi(undefined, undefined, paused)
        const first = renderApp('/agents')
        await screen.findByText(pausedTitle)
        await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
        first.unmount()

        // The same browser session, loaded again: wait until the paused answer is in.
        const client = testQueryClient()
        const second = renderApp('/agents', {}, client)
        await appReady()
        await waitFor(() => expect(client.isFetching()).toBe(0))

        expect(noticeText()).not.toBeInTheDocument()
        second.unmount()

        sessionStorage.clear()
        renderApp('/agents')

        expect(await screen.findByText(pausedTitle)).toBeVisible()
    })

    it('comes back when recording is paused again after being resumed', async () => {
        const { state, handler } = controllable({ recording: 'paused' })
        mockApi(undefined, undefined, handler)
        const client = testQueryClient()
        renderApp('/agents', {}, client)
        await screen.findByText(pausedTitle)
        await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

        state.recording = 'enabled'
        await refetchMeta(client)

        await waitFor(() =>
            expect(sessionStorage.getItem(dismissedKey)).toBeNull(),
        )
        expect(noticeText()).not.toBeInTheDocument()

        state.recording = 'paused'
        await refetchMeta(client)

        expect(await screen.findByText(pausedTitle)).toBeVisible()
    })

    it('goes away by itself when recording resumes', async () => {
        const { state, handler } = controllable({ recording: 'paused' })
        mockApi(undefined, undefined, handler)
        const client = testQueryClient()
        renderApp('/agents', {}, client)
        await screen.findByText(pausedTitle)

        state.recording = 'enabled'
        await refetchMeta(client)

        await waitFor(() => expect(noticeText()).not.toBeInTheDocument())
    })

    it('shows nothing when the pause flag could not be read', async () => {
        const fetchMock = mockApi(undefined, undefined, () =>
            json(metaWith({ recording: null })),
        )
        const client = testQueryClient()
        renderApp('/agents', {}, client)
        await heading('Agents')
        await metaAnswered(fetchMock, client)

        expect(noticeText()).not.toBeInTheDocument()
        expect(notice()).toBeNull()
    })

    it('shows nothing when recording is enabled', async () => {
        const fetchMock = mockApi()
        const client = testQueryClient()
        renderApp('/agents', {}, client)
        await heading('Agents')
        await metaAnswered(fetchMock, client)

        expect(notice()).toBeNull()
    })

    it('still works when session storage throws', async () => {
        mockApi(undefined, undefined, paused)
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('denied')
        })
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('full')
        })
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
            throw new Error('denied')
        })
        renderApp('/agents')
        await screen.findByText(pausedTitle)

        await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

        expect(noticeText()).not.toBeInTheDocument()
        expect(await heading('Agents')).toBeVisible()
    })
})

describe('the API cannot be reached', () => {
    it('shows an app-level error as the page’s heading, and Try again recovers', async () => {
        const { state, handler } = controllable({ fail: 'offline' })
        mockApi(undefined, undefined, handler)
        renderApp('/agents')

        expect(await heading(unreachable)).toBeVisible()
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
        expect(screen.getByRole('alert')).toHaveTextContent(
            /could not be reached/i,
        )
        expect(
            within(nav()).getByRole('link', { name: 'Overview' }),
        ).toBeVisible()

        delete state.fail
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

        expect(await heading('Agents')).toBeVisible()
        expect(screen.queryByText(unreachable)).not.toBeInTheDocument()
        await waitFor(() =>
            expect(screen.getByRole('heading', { level: 1 })).toHaveFocus(),
        )
    })

    it('says it is trying again while the retry runs, and keeps the message', async () => {
        const retry = deferred()
        let attempt = 0
        mockApi(undefined, undefined, () => {
            attempt++

            return attempt === 1
                ? Promise.reject(new TypeError('offline'))
                : retry.promise
        })
        renderApp('/agents')
        await heading(unreachable)

        await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

        const busy = await screen.findByRole('button', {
            name: 'Trying again…',
        })

        expect(busy).toHaveAttribute('aria-disabled', 'true')
        expect(screen.getByText(unreachable)).toBeVisible()

        act(() => {
            retry.resolve(new Response(JSON.stringify(metaWith({}))))
        })

        expect(await heading('Agents')).toBeVisible()
    })

    it('is not shown when a later refresh fails and meta is cached', async () => {
        const { state, handler } = controllable()
        mockApi(undefined, undefined, handler)
        const client = testQueryClient()
        renderApp('/agents', {}, client)
        await heading('Agents')

        state.fail = 'offline'
        await refetchMeta(client)

        await waitFor(() => expect(client.isFetching()).toBe(0))
        expect(screen.queryByText(unreachable)).not.toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Agents' })).toBeVisible()
    })

    it('is not shown for an answer that is an error: that is for the page', async () => {
        const fetchMock = mockApi(undefined, undefined, () =>
            json({ message: 'Broken.' }, 500),
        )
        const client = testQueryClient()
        renderApp('/agents', {}, client)
        await metaAnswered(fetchMock, client)

        expect(await heading('Agents')).toBeVisible()
        expect(screen.queryByText(unreachable)).not.toBeInTheDocument()
    })
})

describe('the session ended or access was lost', () => {
    const states = [
        [401, ended],
        [419, ended],
        [403, denied],
    ] as const

    it.each(states)(
        'a %s from the meta request shows "%s" as the page’s heading, and Reload reloads',
        async (status, title) => {
            mockApi(undefined, undefined, () =>
                json({ message: 'No.' }, status),
            )
            renderApp('/agents')

            expect(await heading(title)).toBeVisible()
            expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
            expect(screen.getByRole('alert')).toBeVisible()
            expect(screen.queryByText(unreachable)).not.toBeInTheDocument()

            await userEvent.click(
                screen.getByRole('button', { name: 'Reload' }),
            )

            expect(reloadPage).toHaveBeenCalledOnce()
        },
    )

    it.each(states)(
        'a %s from the list request shows "%s" in place of the page',
        async (status, title) => {
            mockApi(() => json({ message: 'No.' }, status))
            renderApp('/traces')

            expect(await heading(title)).toBeVisible()
            expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible()
            expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
            expect(
                within(nav()).getByRole('link', { name: 'Traces' }),
            ).toBeVisible()
        },
    )

    it('the sentence says what to do', async () => {
        mockApi(undefined, undefined, () => json({ message: 'No.' }, 401))
        const first = renderApp('/agents')
        await heading(ended)

        expect(
            screen.getByText('Reload the page to sign in again.'),
        ).toBeVisible()
        first.unmount()

        mockApi(undefined, undefined, () => json({ message: 'No.' }, 403))
        renderApp('/agents')
        await heading(denied)

        expect(
            screen.getByText(/Ask whoever manages this application/),
        ).toBeVisible()
    })

    it('stays until the page is reloaded, even if a later request succeeds', async () => {
        const { state, handler } = controllable()
        mockApi(undefined, undefined, handler)
        const client = testQueryClient()
        renderApp('/agents', {}, client)
        await heading('Agents')

        state.fail = 401
        await refetchMeta(client)
        await heading(ended)

        delete state.fail
        await refetchMeta(client)
        await waitFor(() => expect(client.isFetching()).toBe(0))

        expect(screen.getByText(ended)).toBeVisible()
        expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible()
        expect(screen.queryByRole('heading', { name: 'Agents' })).toBeNull()
    })

    it('hands focus to the heading when it replaces a page that had it on a control', async () => {
        const { state, handler } = controllable()
        mockApi(undefined, undefined, handler)
        const client = testQueryClient()
        renderApp('/traces', {}, client)
        await heading('Traces')
        searchBox().focus()
        expect(searchBox()).toHaveFocus()

        state.fail = 419
        await refetchMeta(client)

        const title = await heading(ended)

        await waitFor(() => expect(title).toHaveFocus())
        expect(document.body).not.toHaveFocus()
    })

    it.each([404, 422, 500])(
        'a %s from the list stays with the page',
        async (status) => {
            mockApi(() => json({ message: 'Nope.' }, status))
            renderApp('/traces')

            expect(await heading('Traces')).toBeVisible()
            await waitFor(() => expect(screen.getByText('Nope.')).toBeVisible())
            expect(screen.queryByText(ended)).not.toBeInTheDocument()
            expect(screen.queryByText(denied)).not.toBeInTheDocument()
            expect(
                screen.queryByRole('button', { name: 'Reload' }),
            ).not.toBeInTheDocument()
        },
    )

    it.each([404, 500])(
        'a %s from meta stays with the page',
        async (status) => {
            const fetchMock = mockApi(undefined, undefined, () =>
                json({ message: 'Nope.' }, status),
            )
            const client = testQueryClient()
            renderApp('/agents', {}, client)
            await metaAnswered(fetchMock, client)

            expect(await heading('Agents')).toBeVisible()
            expect(screen.queryByText(ended)).not.toBeInTheDocument()
            expect(screen.queryByText(denied)).not.toBeInTheDocument()
        },
    )
})

describe('which state wins', () => {
    it('a session that ended wins over an API that cannot be reached', async () => {
        const { state, handler } = controllable({ fail: 'offline' })
        mockApi(undefined, undefined, handler)
        renderApp('/agents')
        await heading(unreachable)

        // The retry is answered: the session has ended.
        state.fail = 401
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

        expect(await heading(ended)).toBeVisible()
        expect(screen.queryByText(unreachable)).not.toBeInTheDocument()
    })

    it('a session that ended wins over the setup screen', async () => {
        const { state, handler } = controllable({ any: false })
        mockApi(undefined, undefined, handler)
        const client = testQueryClient()
        renderApp('/agents', {}, client)
        await heading(firstRun)

        state.fail = 403
        await refetchMeta(client)

        expect(await heading(denied)).toBeVisible()
        expect(screen.queryByText(firstRun)).not.toBeInTheDocument()
    })

    it('the setup screen wins over the paused notice', async () => {
        const fetchMock = mockApi(undefined, undefined, () =>
            json(metaWith({ any: false, recording: 'paused' })),
        )
        const client = testQueryClient()
        renderApp('/agents', {}, client)

        await heading(
            'Recording is paused: nothing will be recorded until it is resumed',
        )
        await metaAnswered(fetchMock, client)

        expect(notice()).toBeNull()
    })
})
