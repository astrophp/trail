import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Span, Trace, TraceDetailResponse } from '@/api/types'
import { createQueryClient } from '@/app/providers/query-provider'
import { notify } from '@/components/patterns/notify'
import { maxFailedRefreshes, refreshEvery } from '@/features/trace/use-trace'
import { appReady, renderApp } from '@/test/render-app'
import {
    answerInTurn,
    detailFixture,
    detailUrls,
    makeAgentSpan,
    makeDetail,
    makeStepSpan,
    makeToolSpan,
    mockTraceApi,
} from '@/test/trace-api'
import { deferred, json } from '@/test/traces-api'

const id = '0199c2f4-6a1e-7c3b-9a55-0e8a4c1d2f30'

beforeEach(() => {
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
})

const open = { status: 'running', duration_ms: null, ended_at: null } as const

/** The run as the server reports it while it runs: usage and cost still pending. */
function runningDetail(spans: Span[], trace: Partial<Trace> = {}) {
    return makeDetail({
        trace: {
            id,
            ...open,
            usage: {
                ...detailFixture.data.trace.usage,
                state: 'pending',
                total_tokens: 4321,
            },
            cost: { state: 'pending', amount: 0.0123 },
            ...trace,
        },
        spans,
    })
}

function finishedDetail(spans: Span[], trace: Partial<Trace> = {}) {
    return makeDetail({
        trace: { id, status: 'completed', issue_kind: null, ...trace },
        spans,
    })
}

/** An agent with a delegated agent (that has a step) and a tool, as far as the run has got. */
function spansSoFar(): Span[] {
    return [
        makeAgentSpan('root', { sequence: 1, ...open }),
        makeAgentSpan('sub', {
            sequence: 2,
            parent_id: 'root',
            name: 'Researcher',
        }),
        makeStepSpan('sub-step', {
            sequence: 3,
            parent_id: 'sub',
            step_number: 0,
        }),
        makeToolSpan('t1', { sequence: 4, parent_id: 'root', name: 'lookup' }),
    ]
}

/** The same run a moment later: another tool, still open, and a step under the collapsed agent. */
function spansLater(): Span[] {
    return [
        ...spansSoFar(),
        makeStepSpan('sub-step-2', {
            sequence: 5,
            parent_id: 'sub',
            step_number: 1,
        }),
        makeToolSpan('t2', {
            sequence: 6,
            parent_id: 'root',
            name: 'notify',
            ...open,
        }),
    ]
}

/** Opens the run's page and waits for it to be on screen. */
async function openRun(search = '') {
    renderApp(`/traces/${id}${search}`)
    await appReady()
    await screen.findByRole('tablist', { name: 'Run views' })
}

/** One refresh interval later, with the answer to the request it made delivered. */
async function tick(times = 1) {
    for (let i = 0; i < times; i++) {
        await act(async () => {
            await vi.advanceTimersByTimeAsync(refreshEvery)
        })
    }
}

const fakeInterval = () =>
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })

const header = () =>
    within(document.querySelector('[data-slot="trace-header"]') as HTMLElement)
const notices = () =>
    document.querySelector<HTMLElement>('[data-slot="run-notices"]')
const selected = () =>
    screen
        .getAllByRole('treeitem')
        .filter((item) => item.getAttribute('aria-selected') === 'true')
        .map((item) => item.getAttribute('aria-label'))
const stillOpen = /This run is still open in the recording/

/** Records whether the loading skeleton was ever put on the page after this call. */
function watchSkeleton() {
    let seen = false
    const look = (records: MutationRecord[]) => {
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (
                    node instanceof Element &&
                    (node.matches('[data-slot="trace-skeleton"]') ||
                        node.querySelector('[data-slot="trace-skeleton"]'))
                ) {
                    seen = true
                }
            }
        }
    }
    const observer = new MutationObserver(look)

    observer.observe(document.body, { childList: true, subtree: true })

    return {
        seen: () => {
            look(observer.takeRecords())

            return seen
        },
        stop: () => observer.disconnect(),
    }
}

describe('a run that is running', () => {
    it('is fetched again every two seconds, shows what arrives, and stops when the run is over', async () => {
        fakeInterval()
        const fetchMock = mockTraceApi({
            [id]: answerInTurn(
                runningDetail(spansSoFar()),
                runningDetail(spansLater()),
                finishedDetail(
                    spansLater().map((span) => ({
                        ...span,
                        status: 'completed',
                    })),
                ),
            ),
        })
        await openRun()

        expect(screen.getByText(stillOpen)).toBeInTheDocument()
        expect(detailUrls(fetchMock)).toHaveLength(1)
        expect(refreshEvery).toBe(2_000)

        await tick()

        expect(
            await screen.findByRole('treeitem', { name: 'notify, Running' }),
        ).toBeInTheDocument()
        expect(detailUrls(fetchMock)).toHaveLength(2)
        expect(screen.getByText(stillOpen)).toBeInTheDocument()

        await tick()

        await waitFor(() =>
            expect(screen.queryByText(stillOpen)).not.toBeInTheDocument(),
        )
        expect(
            screen.getByRole('treeitem', { name: 'notify, Completed' }),
        ).toBeInTheDocument()

        await tick(3)

        expect(detailUrls(fetchMock)).toHaveLength(3)
    })

    it.each([
        'completed',
        'failed',
        'incomplete',
        'awaiting_approval',
    ] as const)(
        'is not fetched again when its status is %s',
        async (status) => {
            fakeInterval()
            const fetchMock = mockTraceApi({
                [id]: finishedDetail(spansSoFar(), { status }),
            })
            await openRun()
            await screen.findByRole('tree')

            await tick(3)

            expect(detailUrls(fetchMock)).toHaveLength(1)
        },
    )

    it('swaps the data in place: no skeleton, and the selection, tab, collapsed rows and focus stay', async () => {
        fakeInterval()
        const refresh = deferred()
        const fetchMock = mockTraceApi({
            [id]: answerInTurn(
                runningDetail(spansSoFar()),
                () => refresh.promise,
            ),
        })
        await openRun('?span=t1&tab=raw')
        await screen.findByRole('tree')
        const agent = screen.getByRole('treeitem', { name: /^Researcher/ })

        // The agent's row is collapsed, and the keyboard is on it; the selected span is another.
        act(() => agent.focus())
        await userEvent.keyboard('{ArrowLeft}')
        expect(agent).toHaveAttribute('aria-expanded', 'false')
        const skeleton = watchSkeleton()

        // The refresh is under way, and the run stays as it was.
        await tick()
        expect(detailUrls(fetchMock)).toHaveLength(2)
        expect(skeleton.seen()).toBe(false)
        expect(screen.getByRole('tree')).toBeVisible()
        expect(
            screen.queryByRole('treeitem', { name: 'notify, Running' }),
        ).not.toBeInTheDocument()

        await act(async () => {
            refresh.resolve(
                new Response(JSON.stringify(runningDetail(spansLater()))),
            )
            await vi.advanceTimersByTimeAsync(0)
        })
        await screen.findByRole('treeitem', { name: 'notify, Running' })

        expect(skeleton.seen()).toBe(false)
        skeleton.stop()
        expect(selected()).toEqual(['lookup, Completed'])
        expect(window.location.search).toBe('?span=t1&tab=raw')
        expect(
            within(screen.getByRole('tablist', { name: 'Evidence' })).getByRole(
                'tab',
                { name: 'Raw' },
            ),
        ).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByRole('treeitem', { name: /^Researcher/ })).toBe(
            agent,
        )
        expect(agent).toHaveAttribute('aria-expanded', 'false')
        expect(agent).toHaveFocus()
        expect(
            screen.queryByRole('treeitem', { name: /^Model step/ }),
        ).not.toBeInTheDocument()
    })

    it('keeps the search, the filter and the focus in the search field', async () => {
        fakeInterval()
        mockTraceApi({
            [id]: answerInTurn(
                runningDetail(spansSoFar()),
                runningDetail([
                    ...spansSoFar(),
                    makeToolSpan('t2', {
                        sequence: 5,
                        parent_id: 'root',
                        name: 'lookup again',
                        ...open,
                    }),
                    makeToolSpan('t3', {
                        sequence: 6,
                        parent_id: 'root',
                        name: 'notify',
                        ...open,
                    }),
                ]),
            ),
        })
        await openRun()
        await screen.findByRole('tree')
        const search = screen.getByRole('searchbox', { name: 'Search spans' })

        await userEvent.type(search, 'lookup')

        await tick()
        await screen.findByRole('treeitem', { name: 'lookup again, Running' })

        expect(search).toHaveValue('lookup')
        expect(search).toHaveFocus()
        expect(
            screen.queryByRole('treeitem', { name: 'notify, Running' }),
        ).not.toBeInTheDocument()
    })

    it('stays on the view the URL names', async () => {
        fakeInterval()
        const fetchMock = mockTraceApi({
            [id]: answerInTurn(
                runningDetail(spansSoFar()),
                runningDetail(spansLater()),
            ),
        })
        await openRun('?view=metadata')

        await tick()
        await waitFor(() => expect(detailUrls(fetchMock)).toHaveLength(2))
        await screen.findByRole('tab', { name: 'Metadata', selected: true })

        expect(window.location.search).toBe('?view=metadata')
    })

    it('keeps reading Pending while a refresh carries larger partial amounts', async () => {
        fakeInterval()
        mockTraceApi({
            [id]: answerInTurn(
                runningDetail(spansSoFar()),
                runningDetail(spansLater(), {
                    usage: {
                        ...detailFixture.data.trace.usage,
                        state: 'pending',
                        total_tokens: 98765,
                    },
                    cost: { state: 'pending', amount: 0.5 },
                }),
            ),
        })
        await openRun()
        expect(header().getAllByText('Pending')).toHaveLength(2)

        await tick()
        await screen.findByRole('treeitem', { name: 'notify, Running' })

        expect(header().getAllByText('Pending')).toHaveLength(2)
        expect(header().getByText('In progress')).toBeInTheDocument()
        expect(header().queryByText(/98\.8k|98,765/)).not.toBeInTheDocument()
        expect(header().queryByText(/\$0\.5/)).not.toBeInTheDocument()
    })

    it.each([
        ['an error from the server', 500],
        [
            'a network failure',
            () => Promise.reject(new TypeError('Failed to fetch')),
        ],
    ] as const)(
        'keeps the last data when a refresh fails with %s, and asks again on the next tick',
        async (_name, failure) => {
            fakeInterval()
            const fetchMock = mockTraceApi({
                [id]: answerInTurn(
                    runningDetail(spansSoFar()),
                    failure,
                    runningDetail(spansLater()),
                ),
            })
            await openRun()
            await screen.findByRole('tree')

            await tick()
            await waitFor(() => expect(detailUrls(fetchMock)).toHaveLength(2))

            expect(screen.getByRole('tree')).toBeVisible()
            expect(screen.getByText(stillOpen)).toBeInTheDocument()
            expect(
                screen.queryByText('The run could not be loaded'),
            ).not.toBeInTheDocument()
            expect(screen.queryByRole('alert')).not.toBeInTheDocument()

            await tick()

            expect(
                await screen.findByRole('treeitem', {
                    name: 'notify, Running',
                }),
            ).toBeInTheDocument()
            expect(detailUrls(fetchMock)).toHaveLength(3)
        },
    )

    it('is not found when a refresh finds the run gone, and is not asked for again', async () => {
        fakeInterval()
        const fetchMock = mockTraceApi({
            [id]: answerInTurn(runningDetail(spansSoFar()), 404),
        })
        await openRun()
        await screen.findByRole('tree')

        await tick()

        expect(
            await screen.findByRole('heading', { name: 'Run not found' }),
        ).toBeVisible()
        expect(screen.queryByRole('tree')).not.toBeInTheDocument()

        await tick(3)

        expect(detailUrls(fetchMock)).toHaveLength(2)
    })

    it('stops asking after repeated failures, says so, and goes on when told to try again', async () => {
        fakeInterval()
        let healthy = false
        const fetchMock = mockTraceApi({
            [id]: () =>
                healthy
                    ? json(runningDetail(spansLater()))
                    : json({ message: 'No.' }, 500),
        })
        // The first request must work, so the page is there to fail on.
        healthy = true
        await openRun()
        await screen.findByRole('tree')
        healthy = false
        expect(screen.getByText('This page refreshes by itself.')).toBeVisible()

        await tick()
        await waitFor(() => expect(detailUrls(fetchMock)).toHaveLength(2))
        expect(
            await screen.findByText('The last refresh failed; trying again.'),
        ).toBeVisible()
        expect(
            screen.queryByRole('button', { name: 'Try again' }),
        ).not.toBeInTheDocument()

        await tick(maxFailedRefreshes - 1)
        await screen.findByText('Refreshing stopped after repeated failures.')

        expect(detailUrls(fetchMock)).toHaveLength(1 + maxFailedRefreshes)
        expect(screen.getByRole('tree')).toBeVisible()

        await tick(3)

        expect(detailUrls(fetchMock)).toHaveLength(1 + maxFailedRefreshes)

        healthy = true
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

        expect(
            await screen.findByText('This page refreshes by itself.'),
        ).toBeVisible()
        expect(
            await screen.findByRole('treeitem', { name: 'notify, Running' }),
        ).toBeInTheDocument()
        const asked = detailUrls(fetchMock).length

        await tick()

        expect(detailUrls(fetchMock).length).toBe(asked + 1)
    })

    it('says the last refresh failed, then goes back to normal when the next one works', async () => {
        fakeInterval()
        mockTraceApi({
            [id]: answerInTurn(
                runningDetail(spansSoFar()),
                500,
                runningDetail(spansLater()),
            ),
        })
        await openRun()
        await screen.findByRole('tree')

        await tick()
        await screen.findByText('The last refresh failed; trying again.')

        await tick()
        await screen.findByRole('treeitem', { name: 'notify, Running' })

        expect(screen.getByText('This page refreshes by itself.')).toBeVisible()
        expect(
            screen.queryByText('The last refresh failed; trying again.'),
        ).not.toBeInTheDocument()
    })

    it.each([401, 403, 419])(
        'stops asking when the answer is %i, and says nothing about refreshing',
        async (status) => {
            fakeInterval()
            const fetchMock = mockTraceApi({
                [id]: answerInTurn(runningDetail(spansSoFar()), status),
            })
            await openRun()
            await screen.findByRole('tree')

            await tick()
            await waitFor(() => expect(detailUrls(fetchMock)).toHaveLength(2))
            await tick(3)

            expect(detailUrls(fetchMock)).toHaveLength(2)
            expect(
                screen.queryByText(/refresh/i, { selector: 'span' }),
            ).not.toBeInTheDocument()
        },
    )

    it('does not repeat a failed refresh within its tick, whatever the client retries on a first load', async () => {
        fakeInterval()
        const fetchMock = mockTraceApi({
            [id]: answerInTurn(runningDetail(spansSoFar()), () =>
                Promise.reject(new TypeError('Failed to fetch')),
            ),
        })
        renderApp(`/traces/${id}`, {}, createQueryClient())
        await appReady()
        await screen.findByRole('tree')

        await tick()
        await screen.findByText('The last refresh failed; trying again.')
        // The client's first retry would come after a second.
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 1300))
        })

        expect(detailUrls(fetchMock)).toHaveLength(2)
    })

    it('stops asking when the page is left, and when the route moves to another run', async () => {
        fakeInterval()
        const fetchMock = mockTraceApi({
            [id]: runningDetail(spansSoFar()),
            other: finishedDetail(spansSoFar(), { id: 'other' }),
        })
        const { unmount } = renderApp(`/traces/${id}`)
        await appReady()
        await screen.findByRole('tree')
        await tick()
        const forId = () =>
            detailUrls(fetchMock).filter((url) => url.endsWith(`/${id}`)).length
        expect(forId()).toBe(2)

        act(() => {
            window.history.pushState({}, '', '/trail/traces/other')
            window.dispatchEvent(new PopStateEvent('popstate'))
        })
        await screen.findByRole('tree')
        await tick(3)

        expect(forId()).toBe(2)

        act(() => {
            window.history.pushState({}, '', `/trail/traces/${id}`)
            window.dispatchEvent(new PopStateEvent('popstate'))
        })
        await screen.findByRole('treeitem', { name: 'lookup, Completed' })
        await tick()
        const before = detailUrls(fetchMock).length

        unmount()
        await tick(3)

        expect(detailUrls(fetchMock)).toHaveLength(before)
    })

    it('stops naming the page after the run when a refresh finds it gone', async () => {
        fakeInterval()
        mockTraceApi({
            [id]: answerInTurn(runningDetail(spansSoFar()), 404),
        })
        await openRun()
        const crumbs = () =>
            within(screen.getByRole('navigation', { name: 'breadcrumb' }))
        await waitFor(() =>
            expect(document.title).toBe(
                'SupportAssistant · 0199c2f4…2f30 · Trail',
            ),
        )
        expect(
            crumbs().getByText('SupportAssistant · 0199c2f4…2f30'),
        ).toBeVisible()

        await tick()
        await screen.findByRole('heading', { name: 'Run not found' })

        await waitFor(() => expect(document.title).toBe('Trace · Trail'))
        expect(crumbs().getByText('Trace')).toBeInTheDocument()
        expect(
            crumbs().queryByText('SupportAssistant · 0199c2f4…2f30'),
        ).not.toBeInTheDocument()
    })

    it('waits while the tab is hidden and goes on when it is shown again', async () => {
        fakeInterval()
        const fetchMock = mockTraceApi({
            [id]: answerInTurn(
                runningDetail(spansSoFar()),
                runningDetail(spansLater()),
            ),
        })
        const setVisibility = (state: 'hidden' | 'visible') => {
            Object.defineProperty(document, 'visibilityState', {
                configurable: true,
                get: () => state,
            })
            document.dispatchEvent(
                new Event('visibilitychange', { bubbles: true }),
            )
        }
        await openRun()
        await screen.findByRole('tree')

        setVisibility('hidden')
        await tick(3)

        expect(detailUrls(fetchMock)).toHaveLength(1)

        setVisibility('visible')
        await tick()

        expect(
            await screen.findByRole('treeitem', { name: 'notify, Running' }),
        ).toBeInTheDocument()
        expect(detailUrls(fetchMock)).toHaveLength(2)
    })
})

describe('the bookmark of a run that is running', () => {
    const toggle = () =>
        header().getByRole('button', {
            name: 'Bookmark SupportAssistant 0199c2f4…2f30',
        })

    it('is not flipped back by a refresh that answers with the state from before the press', async () => {
        fakeInterval()
        let saved = false
        let asked = 0
        const refresh = deferred()
        const write = deferred()
        const current = () => runningDetail(spansSoFar(), { bookmarked: saved })
        const fetchMock = mockTraceApi(
            {
                [id]: () => {
                    asked++

                    // The second request is the refresh that is under way when the press is made.
                    return asked === 2 ? refresh.promise : json(current())
                },
            },
            (_url, init) => {
                saved = init?.method === 'PUT'

                return write.promise
            },
        )
        await openRun()
        await screen.findByRole('tree')
        expect(toggle()).toHaveAttribute('aria-pressed', 'false')

        await tick()
        expect(detailUrls(fetchMock)).toHaveLength(2)

        await userEvent.click(toggle())
        expect(toggle()).toHaveAttribute('aria-pressed', 'true')

        // The refresh answers now, with the run as it was before the press.
        await act(async () => {
            refresh.resolve(
                new Response(
                    JSON.stringify(
                        runningDetail(spansSoFar(), { bookmarked: false }),
                    ),
                ),
            )
            await vi.advanceTimersByTimeAsync(0)
        })

        expect(toggle()).toHaveAttribute('aria-pressed', 'true')

        // Nothing asks for the run while the write is on its way, so nothing can undo the press.
        await tick(3)

        expect(detailUrls(fetchMock)).toHaveLength(2)
        expect(toggle()).toHaveAttribute('aria-pressed', 'true')

        // The server has it; the run is fetched again and keeps saying so, and the refresh goes on.
        await act(async () => {
            write.resolve(
                new Response(
                    JSON.stringify({
                        data: { trace_id: id, bookmarked: true },
                    }),
                ),
            )
            await vi.advanceTimersByTimeAsync(0)
        })
        await waitFor(() => expect(detailUrls(fetchMock)).toHaveLength(3))
        expect(toggle()).toHaveAttribute('aria-pressed', 'true')

        await tick()

        expect(detailUrls(fetchMock)).toHaveLength(4)
        expect(toggle()).toHaveAttribute('aria-pressed', 'true')
    })
})

describe('the bookmark of a run that is running, when it goes wrong', () => {
    const toggle = () =>
        header().getByRole('button', {
            name: 'Bookmark SupportAssistant 0199c2f4…2f30',
        })

    it('goes back when the write fails, says so, and the refreshing goes on', async () => {
        fakeInterval()
        const error = vi.spyOn(notify, 'error')
        const fetchMock = mockTraceApi(
            {
                [id]: () =>
                    json(runningDetail(spansSoFar(), { bookmarked: false })),
            },
            () => json({ message: 'No.' }, 500),
        )
        await openRun()
        await screen.findByRole('tree')

        await userEvent.click(toggle())

        await waitFor(() =>
            expect(toggle()).toHaveAttribute('aria-pressed', 'false'),
        )
        expect(error).toHaveBeenCalledWith('The bookmark could not be saved.')
        // The run is fetched again once the write has settled; wait for that to finish.
        await waitFor(() =>
            expect(detailUrls(fetchMock).length).toBeGreaterThan(1),
        )
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0)
        })
        const asked = detailUrls(fetchMock).length

        await tick()

        expect(detailUrls(fetchMock).length).toBe(asked + 1)
        expect(toggle()).toHaveAttribute('aria-pressed', 'false')
        error.mockRestore()
    })

    it('ends in the state of the last press when a second one is made while the first is on its way', async () => {
        fakeInterval()
        let saved = false
        const first = deferred()
        let writes = 0
        const fetchMock = mockTraceApi(
            {
                [id]: () =>
                    json(runningDetail(spansSoFar(), { bookmarked: saved })),
            },
            (_url, init) => {
                saved = init?.method === 'PUT'

                return ++writes === 1
                    ? first.promise
                    : json({ data: { trace_id: id, bookmarked: saved } })
            },
        )
        await openRun()
        await screen.findByRole('tree')

        await userEvent.click(toggle())
        expect(toggle()).toHaveAttribute('aria-pressed', 'true')
        await userEvent.click(toggle())
        expect(toggle()).toHaveAttribute('aria-pressed', 'false')

        await tick(2)
        expect(toggle()).toHaveAttribute('aria-pressed', 'false')

        await act(async () => {
            first.resolve(
                new Response(
                    JSON.stringify({
                        data: { trace_id: id, bookmarked: true },
                    }),
                ),
            )
            await vi.advanceTimersByTimeAsync(0)
        })

        await waitFor(() => expect(writes).toBe(2))
        await waitFor(() => expect(saved).toBe(false))
        await tick()
        expect(toggle()).toHaveAttribute('aria-pressed', 'false')
        expect(
            fetchMock.mock.calls
                .filter(([url]) => url.endsWith('/bookmark'))
                .map(([, init]) => init?.method),
        ).toEqual(['PUT', 'DELETE'])
    })
})

describe('the notices of a run', () => {
    const failover: Span[] = [
        makeAgentSpan('root', { sequence: 1 }),
        makeStepSpan('first-0', {
            sequence: 2,
            parent_id: 'root',
            attempt: 1,
            step_number: 0,
            status: 'failed',
        }),
        makeStepSpan('second-0', {
            sequence: 3,
            parent_id: 'root',
            attempt: 2,
            step_number: 0,
        }),
    ]

    function serve(detail: TraceDetailResponse) {
        mockTraceApi({ [id]: detail })
    }

    it('say nothing about a finished, ordinary run', async () => {
        serve(finishedDetail(spansSoFar()))
        await openRun()
        await screen.findByRole('tree')

        expect(notices()).toBeNull()
    })

    it('say a running run is still open, and that the page refreshes by itself', async () => {
        serve(runningDetail(spansSoFar()))
        await openRun()

        const banner = within(notices() as HTMLElement)

        expect(banner.getByText(stillOpen)).toBeInTheDocument()
        expect(
            banner.getByText(/Usage and completion data are not final yet\./),
        ).toBeInTheDocument()
        expect(
            banner.getByText('This page refreshes by itself.'),
        ).toBeInTheDocument()
    })

    it('say an abandoned run never reported an end, and after how long', async () => {
        serve(
            finishedDetail(spansSoFar(), {
                status: 'incomplete',
                issue_kind: 'abandoned',
            }),
        )
        await openRun()

        const text = (notices() as HTMLElement).textContent

        expect(text).toContain('This run never reported an end')
        expect(text).toContain(
            'It was still marked running after the stale timeout of 1h 00m, which happens when a stream is abandoned or a worker crashes.',
        )
        expect(text).toContain(
            'What was recorded up to that point is shown below.',
        )
    })

    it('say an incomplete run for another reason never reported an end, and nothing about a timeout', async () => {
        serve(
            finishedDetail(spansSoFar(), {
                status: 'incomplete',
                issue_kind: null,
            }),
        )
        await openRun()

        const text = (notices() as HTMLElement).textContent

        expect(text).toContain('This run never reported an end')
        expect(text).toContain(
            'What was recorded up to that point is shown below.',
        )
        expect(text).not.toContain('stale timeout')
    })

    it('name the tool a run waits for, and open the metadata view where the calls are', async () => {
        mockTraceApi({
            [id]: makeDetail({
                trace: { id, status: 'awaiting_approval' },
                spans: spansSoFar(),
                pendingApprovals: [
                    {
                        tool_call_id: 'call-1',
                        tool: 'issue_refund',
                        arguments: {},
                        reason: null,
                    },
                ],
            }),
        })
        await openRun()

        const notice = within(notices() as HTMLElement)

        expect(
            notice.getByText('Waiting for approval of: issue_refund'),
        ).toBeInTheDocument()
        expect(
            notice.getByText(
                'When it is approved, the run that continues is recorded as a separate run.',
            ),
        ).toBeInTheDocument()

        await userEvent.click(
            notice.getByRole('button', { name: 'See the waiting tool calls' }),
        )

        expect(
            await screen.findByRole('tab', {
                name: 'Metadata',
                selected: true,
            }),
        ).toBeInTheDocument()
        expect(window.location.search).toBe('?view=metadata')
        expect(
            screen.getByRole('region', { name: 'Pending approvals' }),
        ).toBeInTheDocument()
    })

    it('name every tool a run waits for once, in order', async () => {
        const call = (tool: string, call: string) => ({
            tool_call_id: call,
            tool,
            arguments: {},
            reason: null,
        })

        mockTraceApi({
            [id]: makeDetail({
                trace: { id, status: 'awaiting_approval' },
                spans: spansSoFar(),
                pendingApprovals: [
                    call('issue_refund', 'a'),
                    call('send_email', 'b'),
                    call('issue_refund', 'c'),
                ],
            }),
        })
        await openRun()

        expect(
            within(notices() as HTMLElement).getByText(
                'Waiting for approval of: issue_refund, send_email',
            ),
        ).toBeInTheDocument()
    })

    it('say a run waits for an approval when it lists no tool', async () => {
        serve(finishedDetail(spansSoFar(), { status: 'awaiting_approval' }))
        await openRun()

        expect(
            within(notices() as HTMLElement).getByText(
                'Waiting for a tool approval',
            ),
        ).toBeInTheDocument()
        expect(
            within(notices() as HTMLElement).queryByRole('button'),
        ).not.toBeInTheDocument()
    })

    it('show the failed attempt of a recovered run, in the execution view', async () => {
        serve(finishedDetail(failover, { recovered: true }))
        await openRun('?view=usage')

        await userEvent.click(
            within(notices() as HTMLElement).getByRole('button', {
                name: 'Show the failed attempt',
            }),
        )

        expect(
            await screen.findByRole('tab', {
                name: 'Execution',
                selected: true,
            }),
        ).toBeInTheDocument()
        expect(selected()).toEqual(['Model step 1, Failed'])
        expect(window.location.search).toBe('?span=first-0')
    })

    it('say a run recovered without a button when its failed attempt is not among the spans', async () => {
        serve(finishedDetail(spansSoFar(), { recovered: true }))
        await openRun()

        const notice = within(notices() as HTMLElement)

        expect(
            notice.getByText(
                'An earlier attempt failed and the run moved on to another.',
            ),
        ).toBeInTheDocument()
        expect(notice.queryByRole('button')).not.toBeInTheDocument()
    })

    it('show the delegated agent that failed, in the execution view', async () => {
        serve(
            finishedDetail(
                [
                    makeAgentSpan('root', { sequence: 1 }),
                    makeAgentSpan('sub', {
                        sequence: 2,
                        parent_id: 'root',
                        name: 'Researcher',
                        status: 'failed',
                    }),
                ],
                { child_failed: true },
            ),
        )
        await openRun('?view=metadata')

        await userEvent.click(
            within(notices() as HTMLElement).getByRole('button', {
                name: 'Show the failed agent',
            }),
        )

        expect(
            await screen.findByRole('tab', {
                name: 'Execution',
                selected: true,
            }),
        ).toBeInTheDocument()
        expect(selected()).toEqual(['Researcher, Failed'])
        expect(window.location.search).toBe('?span=sub')
    })

    it('do not say a run carried on when the run itself failed', async () => {
        serve(
            finishedDetail(spansSoFar(), {
                status: 'failed',
                child_failed: true,
            }),
        )
        await openRun()

        const text = (notices() as HTMLElement).textContent

        expect(text).toContain('A delegated agent failed.')
        expect(text).not.toContain('carried on')
    })

    it('say a delegated agent failed without a button when no failed agent is among the spans', async () => {
        serve(finishedDetail(spansSoFar(), { child_failed: true }))
        await openRun()

        const notice = within(notices() as HTMLElement)

        expect(
            notice.getByText('A delegated agent failed. This run carried on.'),
        ).toBeInTheDocument()
        expect(notice.queryByRole('button')).not.toBeInTheDocument()
    })

    it('say how many spans are shown of how many when the run was cut, above the other notices', async () => {
        serve(
            makeDetail({
                trace: { id, ...open, recovered: true },
                spans: spansSoFar(),
                spanLimit: { limit: 2000, total: 12345, truncated: true },
            }),
        )
        await openRun()

        const text = (notices() as HTMLElement).textContent

        expect(text).toContain('Showing the first 2,000 of 12,345 spans')
        expect(text).toContain('Totals in the header cover the whole run.')
        expect(text).toContain(
            'The tree, the usage table and the coverage cover the spans shown.',
        )
        expect(text.indexOf('Showing the first')).toBeLessThan(
            text.indexOf('still open'),
        )
        expect(text.indexOf('still open')).toBeLessThan(
            text.indexOf('An earlier attempt failed'),
        )
    })
})

describe('a run that is not there', () => {
    it('is not found when the first request says there is no such run', async () => {
        mockTraceApi({})
        renderApp('/traces/ghost')
        await appReady()

        expect(
            await screen.findByRole('heading', { name: 'Run not found' }),
        ).toBeVisible()
        expect(
            screen.getByText(
                'No recorded run has this id. It may have been pruned, or it was never recorded.',
            ),
        ).toBeInTheDocument()
    })

    it('is not found for the run asked for, never for the one shown before it', async () => {
        mockTraceApi({ [id]: finishedDetail(spansSoFar()) })
        await openRun()
        await screen.findByRole('tree')

        act(() => {
            window.history.pushState({}, '', '/trail/traces/ghost')
            window.dispatchEvent(new PopStateEvent('popstate'))
        })

        // At once, before anything is awaited: the run shown before is not under the new id.
        expect(screen.queryByRole('tree')).not.toBeInTheDocument()
        expect(
            screen.queryByRole('heading', { name: 'SupportAssistant' }),
        ).not.toBeInTheDocument()

        expect(
            await screen.findByRole('heading', { name: 'Run not found' }),
        ).toBeVisible()
        expect(screen.queryByRole('tree')).not.toBeInTheDocument()
        expect(
            screen.queryByRole('heading', { name: 'SupportAssistant' }),
        ).not.toBeInTheDocument()
    })

    it('is an error with a way to try again, not "not found", when the first request fails otherwise', async () => {
        mockTraceApi({ [id]: () => json({ message: 'Server error.' }, 500) })
        renderApp(`/traces/${id}`)
        await appReady()

        expect(
            await screen.findByText('The run could not be loaded'),
        ).toBeInTheDocument()
        expect(
            screen.getByRole('button', { name: 'Try again' }),
        ).toBeInTheDocument()
        expect(
            screen.queryByRole('heading', { name: 'Run not found' }),
        ).not.toBeInTheDocument()
    })
})
