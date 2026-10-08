import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Turn } from '@/api/types'
import { forgetTranscriptRefreshFailures } from '@/features/conversations/use-transcript'
import { conversationPath } from '@/lib/conversation-path'
import { maxFailedRefreshes, refreshEvery } from '@/lib/refresh-policy'
import { conversationId, conversationServer } from '@/test/conversation-server'
import { renderApp } from '@/test/render-app'
import { json } from '@/test/traces-api'
import { call, message, turnOf } from '@/test/transcript-api'

beforeEach(() => {
    forgetTranscriptRefreshFailures()
    window.Trail = {
        path: '/trail',
        apiPath: '/trail/api',
        csrfToken: 'csrf-1',
    }
})

afterEach(() => {
    delete window.Trail
    delete (document as { visibilityState?: string }).visibilityState
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

const running = {
    status: 'running',
    duration_ms: null,
    ended_at: null,
} as const

/** A turn that is still running, with a tool call in its activity. */
function runningTurn(id: string, tool = 'lookup'): Turn {
    return turnOf(id, {
        trace: { ...running },
        messages: [
            message('prompt', `Question of ${id}`),
            message('activity', null, {
                tool_calls: [call(tool, { id: `${id}-${tool}` })],
            }),
        ],
    })
}

const finished = (id: string) => turnOf(id)

const fakeInterval = () =>
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })

/** One refresh interval later, with the answer to the requests it made delivered. */
async function tick(times = 1) {
    for (let i = 0; i < times; i++) {
        await act(async () => {
            await vi.advanceTimersByTimeAsync(refreshEvery)
        })
    }
}

const route = (extra = '') => `${conversationPath(conversationId)}${extra}`
const article = (number: number) =>
    screen.getByRole('article', { name: `Turn ${number}` })
const numbers = () =>
    screen
        .getAllByRole('article')
        .map((item) =>
            Number(item.querySelector('h2 .sr-only')?.textContent?.slice(5)),
        )
const queries = (server: ReturnType<typeof conversationServer>) =>
    server.transcript().map((params) => Object.fromEntries(params))
/** The refreshes of one turn by itself: `turn` with `limit` 1. */
const turnRefreshes = (server: ReturnType<typeof conversationServer>) =>
    queries(server).filter((query) => query.limit === '1')
const status = (number: number) =>
    article(number).querySelector('[data-slot="status-badge"]')

async function open(path = route()) {
    renderApp(path)
    await screen.findAllByRole('article', { name: /^Turn / })
}

/** Records whether the loading skeleton was put on the page after this call. */
function watchSkeleton() {
    let seen = false
    const observer = new MutationObserver((records) => {
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (
                    node instanceof Element &&
                    (node.matches('[data-slot="transcript-skeleton"]') ||
                        node.querySelector('[data-slot="transcript-skeleton"]'))
                ) {
                    seen = true
                }
            }
        }
    })

    observer.observe(document.body, { childList: true, subtree: true })

    return { seen: () => seen, stop: () => observer.disconnect() }
}

describe('a running turn', () => {
    it('is asked for by itself every two seconds and merged by run id, which also brings up the totals', async () => {
        fakeInterval()
        const server = conversationServer([finished('r1'), runningTurn('r2')])

        await open()
        expect(status(2)).toHaveAttribute('data-status', 'running')
        expect(screen.getByText('2 recorded turns')).toBeVisible()
        expect(turnRefreshes(server)).toEqual([])

        server.turns = [finished('r1'), finished('r2'), finished('r3')]
        await tick()

        await waitFor(() =>
            expect(status(2)).toHaveAttribute('data-status', 'completed'),
        )
        expect(turnRefreshes(server)).toEqual([
            { id: conversationId, turn: 'r2', limit: '1' },
        ])
        // The totals are the conversation's, brought by the same answers.
        expect(await screen.findByText('3 recorded turns')).toBeVisible()
        expect(numbers()).toEqual([1, 2, 3])
    })

    it('swaps in place: nothing remounts, no skeleton, an open list stays open and focus stays', async () => {
        fakeInterval()
        const server = conversationServer([finished('r1'), runningTurn('r2')])
        const scrollTo = vi.spyOn(window, 'scrollTo')
        const scrollBy = vi.fn()
        const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView')

        window.scrollBy = scrollBy
        await open()

        const before = article(2)
        const toggle = within(before).getByRole('button', {
            name: 'Show messages',
        })

        await userEvent.click(toggle)
        expect(
            within(before).getByRole('button', { name: 'Hide messages' }),
        ).toHaveAttribute('aria-expanded', 'true')
        expect(toggle).toHaveFocus()

        const skeleton = watchSkeleton()

        scrollTo.mockClear()
        scrollIntoView.mockClear()
        // The turn moves on: another tool call, still running.
        server.turns = [finished('r1'), runningTurn('r2', 'lookup_again')]
        await tick()
        await waitFor(() => expect(turnRefreshes(server)).toHaveLength(1))
        await screen.findByRole('link', { name: /lookup_again/ })

        expect(article(2)).toBe(before)
        expect(toggle.isConnected).toBe(true)
        expect(toggle).toHaveFocus()
        expect(toggle).toHaveAttribute('aria-expanded', 'true')
        expect(skeleton.seen()).toBe(false)
        expect(scrollTo).not.toHaveBeenCalled()
        expect(scrollBy).not.toHaveBeenCalled()
        expect(scrollIntoView).not.toHaveBeenCalled()
        skeleton.stop()
    })

    it('stops asking when nothing is running any more', async () => {
        fakeInterval()
        const server = conversationServer([finished('r1'), runningTurn('r2')])

        await open()
        server.turns = [finished('r1'), finished('r2')]
        await tick()
        await waitFor(() =>
            expect(status(2)).toHaveAttribute('data-status', 'completed'),
        )

        const asked = queries(server).length

        await tick(5)

        expect(queries(server)).toHaveLength(asked)
    })

    it('asks nothing at all when no turn is running', async () => {
        fakeInterval()
        const server = conversationServer([finished('r1'), finished('r2')])

        await open()
        await tick(3)

        expect(queries(server)).toHaveLength(1)
    })

    it('says the page refreshes by itself while a turn runs, and not otherwise', async () => {
        fakeInterval()
        const server = conversationServer([finished('r1'), runningTurn('r2')])

        await open()
        expect(
            screen.getByText('Running turns refresh by themselves.'),
        ).toBeVisible()

        server.turns = [finished('r1'), finished('r2')]
        await tick()
        await waitFor(() =>
            expect(
                screen.queryByText('Running turns refresh by themselves.'),
            ).toBeNull(),
        )
    })
})

describe('the refresh clock', () => {
    const setVisibility = (state: 'hidden' | 'visible') => {
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => state,
        })
        document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))
    }

    it('pauses while the document is hidden and goes on when it is shown', async () => {
        fakeInterval()
        const server = conversationServer([runningTurn('r1')])

        await open()
        setVisibility('hidden')
        await tick(3)

        expect(turnRefreshes(server)).toEqual([])

        setVisibility('visible')
        await tick()

        await waitFor(() => expect(turnRefreshes(server)).toHaveLength(1))
    })

    it('keeps what is shown when a refresh fails, says so, stops after three in a row and goes on when told to', async () => {
        fakeInterval()
        const server = conversationServer([finished('r1'), runningTurn('r2')])

        await open()

        let healthy = false

        server.intercept = (_url, params) =>
            !healthy && (params.get('limit') === '1' || params.has('after'))
                ? json({ message: 'No.' }, 500)
                : undefined
        await tick()

        expect(
            await screen.findByText('The last refresh failed; trying again.'),
        ).toBeVisible()
        // Still the page, with its turns: not an error state.
        expect(numbers()).toEqual([1, 2])
        expect(
            screen.queryByRole('heading', { name: /could not be loaded/ }),
        ).toBeNull()

        await tick(maxFailedRefreshes - 1)
        await screen.findByText('Refreshing stopped after repeated failures.')

        expect(turnRefreshes(server)).toHaveLength(maxFailedRefreshes)
        expect(numbers()).toEqual([1, 2])

        await tick(4)

        expect(turnRefreshes(server)).toHaveLength(maxFailedRefreshes)

        healthy = true
        server.turns = [finished('r1'), finished('r2')]
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

        await waitFor(() =>
            expect(status(2)).toHaveAttribute('data-status', 'completed'),
        )
        expect(
            screen.queryByText('Refreshing stopped after repeated failures.'),
        ).toBeNull()
    })

    it.each([404, 401, 403, 419])(
        'stops asking at once for a %i',
        async (code) => {
            fakeInterval()
            const server = conversationServer([runningTurn('r1')])

            await open()
            server.intercept = (_url, params) =>
                params.get('limit') === '1'
                    ? json({ message: 'Gone.' }, code)
                    : undefined
            await tick()
            await waitFor(() => expect(turnRefreshes(server)).toHaveLength(1))
            await tick(4)

            expect(turnRefreshes(server)).toHaveLength(1)

            // A 404 leaves the turns; the others are the shell's to say (the session or access is gone).
            if (code === 404) {
                expect(numbers()).toEqual([1])
            }
        },
    )
})

describe('turns recorded while the page is open', () => {
    it('appends them on the tick, in order, with the right numbers, and goes on asking for the one that runs', async () => {
        fakeInterval()
        const server = conversationServer([finished('r1'), runningTurn('r2')])

        await open()
        server.turns = [
            finished('r1'),
            finished('r2'),
            finished('r3'),
            runningTurn('r4'),
        ]
        await tick()

        await screen.findByRole('article', { name: 'Turn 4' })

        expect(numbers()).toEqual([1, 2, 3, 4])
        expect(queries(server)).toContainEqual({
            id: conversationId,
            after: 'r2',
        })
        expect(within(article(3)).getByText('Answer of r3')).toBeVisible()

        const asked = turnRefreshes(server).length

        await tick()

        await waitFor(() =>
            expect(turnRefreshes(server).length).toBeGreaterThan(asked),
        )
        expect(turnRefreshes(server).at(-1)).toMatchObject({ turn: 'r4' })
    })

    it('asks for what comes after the newest loaded turn, so it is asked with that turn’s id', async () => {
        fakeInterval()
        const server = conversationServer([finished('r1'), runningTurn('r2')])

        await open()
        await tick()

        await waitFor(() =>
            expect(queries(server)).toContainEqual({
                id: conversationId,
                after: 'r2',
            }),
        )
    })

    it('does not ask for later turns when the newest window is not the one loaded', async () => {
        fakeInterval()
        const turns = Array.from({ length: 25 }, (_, index) =>
            index === 4 ? runningTurn('r5') : finished(`r${index + 1}`),
        )
        const server = conversationServer(turns)

        await open(route('&turn=r5'))
        await tick()

        await waitFor(() => expect(turnRefreshes(server)).toHaveLength(1))
        expect(queries(server).some((query) => 'after' in query)).toBe(false)
        expect(numbers()).toEqual([1, 2, 3, 4, 5])
        expect(
            screen.getByRole('button', { name: 'Show later turns (20)' }),
        ).toBeVisible()
    })

    it('keeps the earlier windows that were loaded', async () => {
        fakeInterval()
        const turns = Array.from({ length: 25 }, (_, index) =>
            index === 24 ? runningTurn('r25') : finished(`r${index + 1}`),
        )
        const server = conversationServer(turns)

        await open()
        await userEvent.click(
            screen.getByRole('button', { name: /^Show earlier turns/ }),
        )
        await screen.findByRole('article', { name: 'Turn 6' })
        server.turns = [...turns.slice(0, 24), finished('r25'), finished('r26')]
        await tick()
        await screen.findByRole('article', { name: 'Turn 26' })

        expect(numbers()).toEqual(Array.from({ length: 21 }, (_, i) => i + 6))
        expect(
            screen.getByRole('button', { name: 'Show earlier turns (5)' }),
        ).toBeVisible()
    })
})

describe('the shell’s refresh control', () => {
    it('asks again for the page without a reload and shows turns recorded since', async () => {
        const server = conversationServer([finished('r1'), finished('r2')])
        const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView')

        await open()
        server.turns = [finished('r1'), finished('r2'), finished('r3')]
        scrollIntoView.mockClear()

        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

        await screen.findByRole('article', { name: 'Turn 3' })

        expect(numbers()).toEqual([1, 2, 3])
        expect(screen.getByText('3 recorded turns')).toBeVisible()
        expect(queries(server)).toContainEqual({
            id: conversationId,
            after: 'r2',
        })
        expect(scrollIntoView).not.toHaveBeenCalled()
    })

    it('brings up the figures of the conversation when nothing is running and nothing is new', async () => {
        const server = conversationServer([finished('r1')])

        await open()
        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

        await waitFor(() =>
            expect(turnRefreshes(server)).toEqual([
                { id: conversationId, turn: 'r1', limit: '1' },
            ]),
        )
    })

    it('makes the “Updated” text new again: the page’s data counts for it', async () => {
        vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
        conversationServer([finished('r1')])

        await open()
        await act(async () => {
            await vi.advanceTimersByTimeAsync(5 * 60_000)
        })

        const updated = () => screen.getByText(/^Updated /)

        // Everything is old: the page's data too.
        await waitFor(() =>
            expect(updated()).toHaveTextContent('Updated 5m ago'),
        )

        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

        await waitFor(() =>
            expect(updated()).not.toHaveTextContent(/Updated 5m ago/),
        )
    })

    it('keeps the page when the refresh fails', async () => {
        const server = conversationServer([finished('r1')])

        await open()
        server.intercept = () => json({ message: 'No.' }, 500)
        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

        expect(
            await screen.findByText(
                'The last refresh failed. What is shown is from before it.',
            ),
        ).toBeVisible()
        expect(numbers()).toEqual([1])
        expect(screen.queryByRole('alert')).toBeNull()
    })
})
