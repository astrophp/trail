import {
    act,
    cleanup,
    fireEvent,
    screen,
    waitFor,
    within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { traceKeys } from '@/api/traces'
import type { Span, SpanLimit, Status, TraceNeighbours } from '@/api/types'
import { notify } from '@/components/patterns/notify'
import { appReady, renderApp, testQueryClient } from '@/test/render-app'
import {
    makeAgentSpan,
    makeDetail,
    makeStepSpan,
    makeToolSpan,
} from '@/test/trace-api'
import {
    deferred,
    json,
    listFor,
    loaded,
    mockApi,
    travel,
} from '@/test/traces-api'

const view = '/traces?range=7d&status=failed&sort=-cost&page=2'
const fromQuery = new URLSearchParams({ from: view }).toString()

beforeEach(() => {
    window.Trail = {
        path: '/trail',
        apiPath: '/trail/api',
        csrfToken: 'csrf-1',
    }
})

afterEach(() => {
    delete window.Trail
    window.innerWidth = 1024
    vi.restoreAllMocks()
})

/** A run of an agent, a model step and a tool, named after the run so one is never taken for another. */
function spansOf(id: string): Span[] {
    return [
        makeAgentSpan('root', { sequence: 1, name: `Agent of ${id}` }),
        makeStepSpan('s1', { sequence: 2, parent_id: 'root', step_number: 0 }),
        makeToolSpan('t1', {
            sequence: 3,
            parent_id: 'root',
            name: 'search',
            input: { arguments: {} },
        }),
    ]
}

type Served = {
    neighbours?: Record<string, TraceNeighbours | Promise<Response>>
    /** Runs whose answer the test releases by hand. */
    held?: Record<string, Promise<Response>>
    spanLimit?: Partial<SpanLimit>
    /** A run's status and spans when they are not the plain completed run; read on every request. */
    runs?: (id: string) => { status?: Status; spans?: Span[] } | undefined
}

/** A server with the list, the runs `run-a`, `run-b`, … and their neighbours. */
function serve({ neighbours = {}, held = {}, spanLimit, runs }: Served = {}) {
    return mockApi((url) => {
        const { pathname } = new URL(url, 'http://x')

        if (pathname === '/trail/api/traces') {
            return json(listFor(url))
        }

        const [raw, rest] = pathname.split('/').slice(4)
        const id = decodeURIComponent(raw)

        if (rest === 'neighbours') {
            const answer = neighbours[id] ?? { previous: null, next: null }

            return answer instanceof Promise ? answer : json({ data: answer })
        }

        const run = runs?.(id)

        return (
            held[id] ??
            json(
                makeDetail({
                    trace: {
                        id,
                        name: `Run ${id}`,
                        ...(run?.status ? { status: run.status } : {}),
                    },
                    spans: run?.spans ?? spansOf(id),
                    spanLimit,
                }),
            )
        )
    })
}

const neighbourCalls = (fetchMock: ReturnType<typeof serve>) =>
    fetchMock.mock.calls
        .map(([url]) => url)
        .filter((url) => url.includes('/neighbours'))

async function open(route: string, client = testQueryClient()) {
    renderApp(route, {}, client)
    await appReady()
    await screen.findByRole('tree', { name: 'Execution tree' })

    return client
}

const backLinks = () => screen.getAllByRole('link', { name: 'Back to traces' })
const previous = () => screen.getByLabelText('Previous trace')
const next = () => screen.getByLabelText('Next trace')
const search = () => new URLSearchParams(window.location.search)
const evidenceTab = (name: string) =>
    within(screen.getByRole('tablist', { name: 'Evidence' })).getByRole('tab', {
        name,
    })
const row = (name: RegExp | string) => screen.getByRole('treeitem', { name })
const hrefs = () =>
    Array.from(document.querySelectorAll('a')).map((a) =>
        a.getAttribute('href'),
    )
const settled = (get: () => HTMLElement, disabled: boolean) =>
    waitFor(() =>
        expect(get().getAttribute('aria-disabled') === 'true').toBe(disabled),
    )

describe('the way back', () => {
    it('leads to the list view the run was opened from, from the header, the footer and the breadcrumb', async () => {
        serve()
        await open(`/traces/run-a?${fromQuery}&range=7d`)

        const crumb = within(
            screen.getByRole('navigation', { name: 'breadcrumb' }),
        ).getByRole('link', { name: 'Traces' })

        expect(backLinks()).toHaveLength(2)

        for (const link of [...backLinks(), crumb]) {
            expect(link).toHaveAttribute('href', `/trail${view}`)
        }
    })

    it('leads to the bare list without a context', async () => {
        serve()
        await open('/traces/run-a')

        const crumb = within(
            screen.getByRole('navigation', { name: 'breadcrumb' }),
        ).getByRole('link', { name: 'Traces' })

        for (const link of [...backLinks(), crumb]) {
            expect(link).toHaveAttribute('href', '/trail/traces')
        }
    })

    it.each([
        ['//evil.example', 'evil'],
        ['/\\evil.example', 'evil'],
        ['https://evil.example', 'evil'],
        ['javascript:alert(1)', 'javascript'],
        ['/traces/../../evil', 'evil'],
        ['%2F%2Fevil.example', 'evil'],
        ['/unknown-page', 'unknown-page'],
        ['/traces?from=%2Ftraces&x=nested', 'nested'],
        [`/traces?x=${'a'.repeat(4100)}`, 'aaaa'],
    ])(
        'ignores a hostile context (%s) and echoes it nowhere',
        async (from, trace) => {
            const fetchMock = serve()
            await open(
                `/traces/run-a?${new URLSearchParams({ from }).toString()}`,
            )
            const where = window.location.origin + window.location.pathname

            // Wait for the page to be whole, then let anything still on its way arrive.
            await waitFor(() => expect(backLinks()).toHaveLength(2))
            await act(async () => {
                await new Promise((done) => setTimeout(done, 20))
            })

            expect(hrefs().length).toBeGreaterThan(5)

            for (const href of hrefs()) {
                expect(href).not.toContain(trace)
                expect(href?.toLowerCase()).not.toMatch(/^(javascript|https?):/)
            }

            for (const link of backLinks()) {
                expect(link).toHaveAttribute('href', '/trail/traces')
            }

            expect(
                within(
                    screen.getByRole('navigation', { name: 'breadcrumb' }),
                ).getByRole('link', { name: 'Traces' }),
            ).toHaveAttribute('href', '/trail/traces')
            expect(window.location.origin + window.location.pathname).toBe(
                where,
            )
            expect(window.location.pathname).toBe('/trail/traces/run-a')
            expect(
                screen.queryByRole('group', { name: 'Step through the list' }),
            ).not.toBeInTheDocument()
            expect(neighbourCalls(fetchMock)).toEqual([])
        },
    )

    it('is on the page of a run that does not exist too', async () => {
        serve({ held: { ghost: json({ message: 'No.' }, 404) } })
        renderApp(`/traces/ghost?${fromQuery}`)
        await appReady()
        await screen.findByRole('heading', { name: 'Run not found' })

        expect(
            screen.getByRole('link', { name: 'Back to traces' }),
        ).toHaveAttribute('href', `/trail${view}`)
    })

    it('does not nest: a list opened with a from of its own, a run, back and the run again', async () => {
        serve()
        renderApp(`${view}&from=${encodeURIComponent('/traces?stray=1')}`)
        await appReady()
        await loaded()

        const link = () =>
            screen.getByRole('link', { name: 'Bare' }).getAttribute('href')

        expect(new URL(link() ?? '', 'http://x').searchParams.get('from')).toBe(
            view,
        )

        await userEvent.click(screen.getByRole('link', { name: 'Bare' }))
        await screen.findByRole('tree', { name: 'Execution tree' })
        const opened = window.location.search

        await userEvent.click(backLinks()[0])
        await loaded()
        expect(window.location.search).toBe(view.slice('/traces'.length))

        await userEvent.click(screen.getByRole('link', { name: 'Bare' }))
        await screen.findByRole('tree', { name: 'Execution tree' })

        expect(window.location.search).toBe(opened)
        expect(search().get('from')).toBe(view)
    })

    it('returns to the same list from the link, and from the browser Back', async () => {
        serve()
        renderApp(view)
        await appReady()
        await loaded()

        await userEvent.click(screen.getByRole('link', { name: 'Bare' }))
        await screen.findByRole('tree', { name: 'Execution tree' })

        expect(window.location.pathname).toBe('/trail/traces/trace-bare')
        expect(search().get('from')).toBe(view)
        expect(search().has('range')).toBe(false)

        await userEvent.click(backLinks()[0])
        await loaded()

        expect(window.location.pathname + window.location.search).toBe(
            `/trail${view}`,
        )

        await userEvent.click(screen.getByRole('link', { name: 'Bare' }))
        await screen.findByRole('tree', { name: 'Execution tree' })
        await travel('back')
        await loaded()

        expect(window.location.pathname + window.location.search).toBe(
            `/trail${view}`,
        )
    })
})

describe('stepping through the list', () => {
    it('asks for the neighbours in the list view, without the page', async () => {
        const fetchMock = serve()
        await open(
            `/traces/run-a?${new URLSearchParams({ from: '/traces?range=7d&status=failed&search=refund&sort=-cost&page=3' })}`,
        )

        await waitFor(() =>
            expect(neighbourCalls(fetchMock)).toEqual([
                '/trail/api/traces/run-a/neighbours?range=7d&sort=-cost&status=failed&search=refund',
            ]),
        )
    })

    it('carries the slow filter into the neighbours request', async () => {
        const fetchMock = serve()
        await open(
            `/traces/run-a?${new URLSearchParams({ from: '/traces?range=7d&slow=1&page=2' })}`,
        )

        await waitFor(() =>
            expect(neighbourCalls(fetchMock)).toEqual([
                '/trail/api/traces/run-a/neighbours?range=7d&sort=-started_at&slow=1',
            ]),
        )
    })

    it('carries the issue kind and the flags into the neighbours request', async () => {
        const fetchMock = serve()
        await open(
            `/traces/run-a?${new URLSearchParams({ from: '/traces?range=7d&issue_kind=exception&child_failed=1&unpriced=1&recovered=1&page=2' })}`,
        )

        await waitFor(() =>
            expect(neighbourCalls(fetchMock)).toEqual([
                '/trail/api/traces/run-a/neighbours?range=7d&sort=-started_at&issue_kind=exception&child_failed=1&unpriced=1&recovered=1',
            ]),
        )
    })

    it('has both steps off while the answer is loading', async () => {
        const answer = deferred()
        serve({ neighbours: { 'run-a': answer.promise } })
        await open(`/traces/run-a?${fromQuery}`)

        expect(previous()).toHaveAttribute('aria-disabled', 'true')
        expect(next()).toHaveAttribute('aria-disabled', 'true')
        expect(
            screen.queryByText(/No other run|could not be loaded/),
        ).toBeNull()

        await act(async () => {
            answer.resolve(
                new Response(
                    JSON.stringify({
                        data: { previous: 'run-0', next: 'run-b' },
                    }),
                ),
            )
            await Promise.resolve()
        })

        await settled(previous, false)
        await settled(next, false)
    })

    it('has one step off at the end of the view', async () => {
        serve({ neighbours: { 'run-a': { previous: null, next: 'run-b' } } })
        await open(`/traces/run-a?${fromQuery}`)

        await settled(next, false)
        expect(previous()).toHaveAttribute('aria-disabled', 'true')
        expect(previous()).not.toHaveAttribute('href')
        // A real link: it can be opened in a new tab or copied.
        expect(next()).toHaveAttribute(
            'href',
            `/trail/traces/run-b?${fromQuery}`,
        )

        await userEvent.click(previous())
        expect(window.location.pathname).toBe('/trail/traces/run-a')
    })

    it('does not offer a step to the run already shown', async () => {
        serve({ neighbours: { 'run-a': { previous: 'run-a', next: 'run-b' } } })
        await open(`/traces/run-a?${fromQuery}`)

        await settled(next, false)
        expect(previous()).toHaveAttribute('aria-disabled', 'true')

        await userEvent.keyboard('k')
        expect(window.location.pathname).toBe('/trail/traces/run-a')
    })

    it('has both off, and says why in words tied to the steps, when there is no neighbour', async () => {
        const fetchMock = serve()
        await open(`/traces/run-a?${fromQuery}`)

        await waitFor(() => expect(neighbourCalls(fetchMock)).toHaveLength(1))

        const note = await screen.findByText(
            'No other run before or after this one in the list it was opened from.',
        )

        expect(
            screen.getByRole('group', { name: 'Step through the list' }),
        ).toHaveAttribute('aria-describedby', note.id)
        expect(previous()).toHaveAttribute('aria-disabled', 'true')
        expect(next()).toHaveAttribute('aria-disabled', 'true')
    })

    it('says so when the neighbours could not be loaded', async () => {
        serve({
            neighbours: { 'run-a': json({ message: 'Down.' }, 500) },
        })
        await open(`/traces/run-a?${fromQuery}`)

        expect(
            await screen.findByText('Previous and next could not be loaded.'),
        ).toBeVisible()
        expect(previous()).toHaveAttribute('aria-disabled', 'true')
        expect(next()).toHaveAttribute('aria-disabled', 'true')
        expect(screen.queryByText(/No other run/)).toBeNull()
    })

    it('shows no steps and asks for nothing without a list context', async () => {
        const fetchMock = serve()
        await open('/traces/run-a')

        expect(
            screen.queryByRole('group', { name: 'Step through the list' }),
        ).not.toBeInTheDocument()
        expect(neighbourCalls(fetchMock)).toEqual([])
    })

    it('opens the next run with the same context, and shows its loading state, never the last run', async () => {
        const held = deferred()
        serve({
            neighbours: {
                'run-a': { previous: null, next: 'run-b' },
                'run-b': { previous: 'run-a', next: null },
            },
            held: { 'run-b': held.promise },
        })
        await open(`/traces/run-a?${fromQuery}&span=s1&tab=raw&view=execution`)
        await settled(next, false)
        const entries = window.history.length

        await userEvent.click(next())

        // Straight after the step: the new run is loading and nothing of the old one is on screen.
        expect(window.location.pathname).toBe('/trail/traces/run-b')
        expect(window.location.search).toBe(`?${fromQuery}`)
        expect(window.history.length).toBe(entries + 1)
        expect(
            screen.getByRole('status', { name: 'Loading run' }),
        ).toBeInTheDocument()
        expect(screen.queryByRole('tree')).not.toBeInTheDocument()
        expect(screen.queryByText(/Agent of run-a/)).not.toBeInTheDocument()
        expect(screen.queryByText('Run run-a')).not.toBeInTheDocument()

        await act(async () => {
            held.resolve(
                new Response(
                    JSON.stringify(
                        makeDetail({
                            trace: { id: 'run-b', name: 'Run run-b' },
                            spans: spansOf('run-b'),
                        }),
                    ),
                ),
            )
            await Promise.resolve()
        })

        expect(
            await screen.findByRole('heading', { level: 1, name: 'Run run-b' }),
        ).toBeVisible()
        expect(row(/Agent of run-b/)).toBeVisible()
        // The step's own control went with the old page: focus is on the new page's heading.
        expect(
            screen.getByRole('heading', { level: 1, name: 'Run run-b' }),
        ).toHaveFocus()
        await settled(previous, false)
        expect(next()).toHaveAttribute('aria-disabled', 'true')

        await travel('back')

        expect(
            await screen.findByRole('heading', { level: 1, name: 'Run run-a' }),
        ).toBeVisible()
    })

    it('steps with j and k', async () => {
        serve({
            neighbours: {
                'run-a': { previous: null, next: 'run-b' },
                'run-b': { previous: 'run-a', next: null },
            },
        })
        await open(`/traces/run-a?${fromQuery}`)
        await settled(next, false)

        await userEvent.keyboard('k')
        expect(window.location.pathname).toBe('/trail/traces/run-a')

        await userEvent.keyboard('j')
        expect(window.location.pathname).toBe('/trail/traces/run-b')
        await screen.findByRole('heading', { level: 1, name: 'Run run-b' })
        await settled(previous, false)

        await userEvent.keyboard('j')
        expect(window.location.pathname).toBe('/trail/traces/run-b')

        await userEvent.keyboard('k')
        expect(window.location.pathname).toBe('/trail/traces/run-a')
    })

    it('leaves j and k to a field, a modifier, and a page without a list', async () => {
        serve({ neighbours: { 'run-a': { previous: 'run-0', next: 'run-b' } } })
        await open(`/traces/run-a?${fromQuery}`)
        await settled(next, false)

        await userEvent.click(
            screen.getByRole('searchbox', { name: 'Search spans' }),
        )
        await userEvent.keyboard('jk')
        expect(window.location.pathname).toBe('/trail/traces/run-a')

        await userEvent.click(document.body)
        await userEvent.keyboard('{Control>}j{/Control}{Alt>}k{/Alt}')
        expect(window.location.pathname).toBe('/trail/traces/run-a')
    })

    it('has no shortcuts on a page without a list', async () => {
        const fetchMock = serve()
        await open('/traces/run-a')

        await userEvent.keyboard('jk')

        expect(window.location.pathname).toBe('/trail/traces/run-a')
        expect(neighbourCalls(fetchMock)).toEqual([])
    })

    it('lists the shortcuts beside the steps', async () => {
        serve({ neighbours: { 'run-a': { previous: 'run-0', next: 'run-b' } } })
        await open(`/traces/run-a?${fromQuery}`)
        await settled(next, false)

        expect(previous()).toHaveAttribute('title', 'Previous trace (k)')
        expect(next()).toHaveAttribute('title', 'Next trace (j)')
        expect(previous()).toHaveAttribute('aria-keyshortcuts', 'k')
        expect(
            within(
                screen.getByRole('group', { name: 'Step through the list' }),
            ).getAllByText(/^[jk]$/),
        ).toHaveLength(2)
    })
})

describe('copying a link', () => {
    function stubClipboard(writeText: (text: string) => Promise<void>) {
        const stub = vi.fn(writeText)
        vi.stubGlobal('navigator', {
            ...navigator,
            clipboard: { writeText: stub },
        })

        return stub
    }

    const copy = () =>
        act(async () => {
            // Not user-event: it installs a clipboard of its own, hiding the stub under test.
            fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
            await Promise.resolve()
        })

    it('copies the run with the span and tab on screen when the URL names none, without the list', async () => {
        const writeText = stubClipboard(() => Promise.resolve())
        const success = vi.spyOn(notify, 'success')
        serve()
        await open(`/traces/run-a?${fromQuery}`)

        await copy()

        expect(writeText).toHaveBeenCalledWith(
            `${window.location.origin}/trail/traces/run-a?span=root&tab=metadata`,
        )
        expect(success).toHaveBeenCalledWith('Link copied.')
    })

    it('copies exactly the span, tab and view that are chosen', async () => {
        const writeText = stubClipboard(() => Promise.resolve())
        serve()
        // The tree is hidden in the usage view: the header is what shows the run is in.
        renderApp(`/traces/run-a?${fromQuery}&view=usage&span=t1&tab=raw`)
        await appReady()
        await screen.findByRole('button', { name: 'Copy link' })

        await copy()

        expect(writeText).toHaveBeenCalledWith(
            `${window.location.origin}/trail/traces/run-a?view=usage&span=t1&tab=raw`,
        )
    })

    it('copies what a change on the page made', async () => {
        const writeText = stubClipboard(() => Promise.resolve())
        serve()
        await open(`/traces/run-a?${fromQuery}`)

        await userEvent.click(row('search, Completed'))
        await copy()

        expect(writeText).toHaveBeenCalledWith(
            `${window.location.origin}/trail/traces/run-a?span=t1&tab=input`,
        )
    })

    it('says so when the clipboard refuses', async () => {
        stubClipboard(() => Promise.reject(new Error('No.')))
        const error = vi.spyOn(notify, 'error')
        serve()
        await open('/traces/run-a')

        await copy()

        expect(error).toHaveBeenCalledWith('The link could not be copied.')
    })

    it('keeps its name when it is only an icon', async () => {
        serve()
        await open('/traces/run-a')

        expect(
            screen.getByRole('button', { name: 'Copy link' }),
        ).toBeInTheDocument()
    })
})

describe('opening a link', () => {
    const scrolled = () => {
        const spy = vi.fn()
        Element.prototype.scrollIntoView = spy

        return spy
    }

    afterEach(() => {
        Element.prototype.scrollIntoView = () => {}
    })

    it('shows the span and tab, and scrolls the row into view once, also when the run refreshes', async () => {
        const scroll = scrolled()
        serve()
        const client = await open('/traces/run-a?span=t1&tab=raw')

        expect(row('search, Completed')).toHaveAttribute(
            'aria-selected',
            'true',
        )
        expect(evidenceTab('Raw')).toHaveAttribute('aria-selected', 'true')
        expect(scroll).toHaveBeenCalledTimes(1)
        expect(scroll).toHaveBeenCalledWith({ block: 'nearest' })
        expect(scroll.mock.contexts[0]).toBe(row('search, Completed'))

        await act(() =>
            client.refetchQueries({ queryKey: traceKeys.detail('run-a') }),
        )
        await userEvent.click(row(/Agent of run-a/))

        expect(scroll).toHaveBeenCalledTimes(1)
    })

    it('says a span that is not in the run once, shows the default, and cleans the URL', async () => {
        serve()
        renderApp(`/traces/run-a?${fromQuery}&span=gone&tab=raw`)
        await appReady()
        await screen.findByRole('tree', { name: 'Execution tree' })
        const entries = window.history.length

        expect(
            screen.getByText(
                'The span this link pointed to is not in this run. Showing the default selection.',
            ),
        ).toBeVisible()
        expect(row(/Agent of run-a/)).toHaveAttribute('aria-selected', 'true')
        await waitFor(() =>
            expect(window.location.search).toBe(`?${fromQuery}`),
        )
        expect(window.history.length).toBe(entries)

        await userEvent.click(
            screen.getByRole('button', { name: 'Dismiss this note' }),
        )
        expect(screen.queryByText(/is not in this run/)).not.toBeInTheDocument()
    })

    it('keeps the list context and the view when it cleans a stale span', async () => {
        serve()
        renderApp(`/traces/run-a?${fromQuery}&view=usage&span=gone&tab=raw`)
        await appReady()
        await screen.findByRole('button', { name: 'Copy link' })

        expect(await screen.findByText(/is not in this run/)).toBeVisible()
        await waitFor(() =>
            expect(window.location.search).toBe(`?${fromQuery}&view=usage`),
        )
    })

    it('adds that the span may be beyond the spans shown for a run cut at the limit', async () => {
        serve({ spanLimit: { truncated: true, limit: 3, total: 9 } })
        await open('/traces/run-a?span=gone')

        expect(
            screen.getByText(
                /Showing the default selection\. It may be beyond the spans shown\./,
            ),
        ).toBeVisible()
    })

    it('says a tab the span does not have once, shows its first, and cleans the URL', async () => {
        serve()
        renderApp(`/traces/run-a?${fromQuery}&view=usage&span=t1&tab=output`)
        await appReady()
        await screen.findByRole('button', { name: 'Copy link' })
        const entries = window.history.length

        expect(
            screen.getByText(
                'That tab is not available for this span. Showing Input.',
            ),
        ).toBeVisible()
        await waitFor(() =>
            expect(window.location.search).toBe(
                `?${fromQuery}&view=usage&span=t1`,
            ),
        )
        expect(window.history.length).toBe(entries)

        // Reloaded from the cleaned address (the page gone, a fresh one rendered), it has nothing to say.
        const reloaded = `/traces/run-a${window.location.search}`
        cleanup()
        renderApp(reloaded)
        await appReady()
        await screen.findByRole('button', { name: 'Copy link' })
        expect(screen.queryByText(/not available/)).not.toBeInTheDocument()
    })

    it('says nothing for a link that is right', async () => {
        serve()
        await open('/traces/run-a?span=s1&tab=raw')

        expect(
            screen.queryByText(/not available|is not in this run/),
        ).toBeNull()
        expect(search().get('span')).toBe('s1')
    })
})

describe('a run that is still running', () => {
    /** A running run that records `X` only when `recorded.x` is set, and ends when `ended` is. */
    function running() {
        const state = { recorded: false, status: 'running' as Status }
        const fetchMock = serve({
            runs: () => ({
                status: state.status,
                spans: state.recorded
                    ? [
                          ...spansOf('run-a'),
                          makeToolSpan('X', {
                              sequence: 4,
                              parent_id: 'root',
                              name: 'late',
                              input: { arguments: {} },
                          }),
                      ]
                    : spansOf('run-a'),
            }),
        })

        return { state, fetchMock }
    }

    const refresh = (client: Awaited<ReturnType<typeof open>>) =>
        act(() =>
            client.refetchQueries({ queryKey: traceKeys.detail('run-a') }),
        )

    it('does not call a span stale that it may record later, and selects it when it arrives', async () => {
        const { state } = running()
        const client = await open(`/traces/run-a?${fromQuery}&span=X&tab=raw`)

        // The default selection shows, for display only; the link's parameters stay.
        expect(row(/Agent of run-a/)).toHaveAttribute('aria-selected', 'true')
        expect(
            screen.queryByText(/is not in this run|not available/),
        ).toBeNull()
        expect(window.location.search).toBe(`?${fromQuery}&span=X&tab=raw`)

        await refresh(client)
        expect(screen.queryByText(/is not in this run/)).toBeNull()
        expect(window.location.search).toBe(`?${fromQuery}&span=X&tab=raw`)

        state.recorded = true
        await refresh(client)

        await waitFor(() =>
            expect(row('late, Completed')).toHaveAttribute(
                'aria-selected',
                'true',
            ),
        )
        expect(screen.queryByText(/is not in this run/)).toBeNull()
        expect(window.location.search).toBe(`?${fromQuery}&span=X&tab=raw`)
    })

    it('says it once, and cleans the URL then, when the run ends without the span', async () => {
        const { state } = running()
        const client = await open(`/traces/run-a?${fromQuery}&span=X&tab=raw`)

        state.status = 'completed'
        await refresh(client)

        expect(
            await screen.findByText(
                /The span this link pointed to is not in this run/,
            ),
        ).toBeVisible()
        await waitFor(() =>
            expect(window.location.search).toBe(`?${fromQuery}`),
        )

        await refresh(client)
        expect(screen.getAllByText(/is not in this run/)).toHaveLength(1)
    })

    it('judges a tab the same way, once the run has settled', async () => {
        const { state } = running()
        const client = await open(`/traces/run-a?span=t1&tab=output`)

        expect(screen.queryByText(/not available/)).toBeNull()
        expect(window.location.search).toBe('?span=t1&tab=output')

        state.status = 'completed'
        await refresh(client)

        expect(
            await screen.findByText(
                'That tab is not available for this span. Showing Input.',
            ),
        ).toBeVisible()
        await waitFor(() => expect(window.location.search).toBe('?span=t1'))
    })
})

describe('history', () => {
    it('replaces the entry for spans, tabs and views on a wide screen', async () => {
        serve()
        await open('/traces/run-a')
        const entries = window.history.length

        await userEvent.click(row('search, Completed'))
        await userEvent.click(evidenceTab('Raw'))
        await userEvent.click(screen.getByRole('tab', { name: 'Usage' }))

        expect(search().get('span')).toBe('t1')
        expect(search().get('tab')).toBe('raw')
        expect(search().get('view')).toBe('usage')
        expect(window.history.length).toBe(entries)
    })
})

describe('a narrow screen', () => {
    beforeEach(() => {
        window.innerWidth = 500
    })

    const evidence = () => screen.getByRole('region', { name: 'Span evidence' })

    it('opens the evidence with one new entry, which Back removes', async () => {
        const scroll = vi.fn<(options?: ScrollIntoViewOptions) => void>()
        Element.prototype.scrollIntoView = scroll
        serve()
        await open('/traces/run-a')
        const entries = window.history.length

        await userEvent.click(row('search, Completed'))

        expect(search().get('span')).toBe('t1')
        expect(window.history.length).toBe(entries + 1)
        expect(evidence()).toBeVisible()
        // Its top is brought into view; focus is where the pane put it.
        expect(
            scroll.mock.calls.filter(([options]) => options?.block === 'start'),
        ).toHaveLength(1)
        expect(
            scroll.mock.contexts.filter((el) => el === evidence()),
        ).toHaveLength(1)
        expect(evidence()).toHaveFocus()

        await travel('back')

        expect(search().has('span')).toBe(false)
        expect(
            await screen.findByRole('tree', { name: 'Execution tree' }),
        ).toBeVisible()

        Element.prototype.scrollIntoView = () => {}
    })

    it('replaces the entry for a later selection', async () => {
        serve()
        await open('/traces/run-a')
        await userEvent.click(row('search, Completed'))
        const entries = window.history.length

        await userEvent.click(
            within(evidence()).getByRole('button', {
                name: /Agent of run-a/,
            }),
        )

        expect(search().get('span')).toBe('root')
        expect(window.history.length).toBe(entries)
    })

    it('goes back to the tree from the evidence as Back does when the page opened it', async () => {
        serve()
        await open('/traces/run-a')
        await userEvent.click(row('search, Completed'))

        await userEvent.click(
            screen.getByRole('button', { name: 'Execution tree' }),
        )

        await waitFor(() => expect(search().has('span')).toBe(false))
        expect(window.location.pathname).toBe('/trail/traces/run-a')

        // It was a step Back, so Forward opens the evidence again.
        await travel('forward')
        expect(search().get('span')).toBe('t1')
    })

    it('clears the span in place when the page was opened on it', async () => {
        serve()
        renderApp('/traces/run-a?span=t1')
        await appReady()
        await screen.findByRole('region', { name: 'Span evidence' })
        const entries = window.history.length

        await userEvent.click(
            screen.getByRole('button', { name: 'Execution tree' }),
        )

        await waitFor(() => expect(search().has('span')).toBe(false))
        expect(window.location.pathname).toBe('/trail/traces/run-a')
        expect(window.history.length).toBe(entries)
        expect(
            await screen.findByRole('tree', { name: 'Execution tree' }),
        ).toBeVisible()
    })

    it('brings the evidence back with Forward after Back', async () => {
        serve()
        await open('/traces/run-a')
        await userEvent.click(row('search, Completed'))

        await travel('back')
        expect(search().has('span')).toBe(false)
        expect(
            await screen.findByRole('tree', { name: 'Execution tree' }),
        ).toBeVisible()

        await travel('forward')
        expect(search().get('span')).toBe('t1')
        expect(
            await screen.findByRole('region', { name: 'Span evidence' }),
        ).toBeVisible()
    })

    it('does not open the evidence for a span the run does not have', async () => {
        serve()
        renderApp('/traces/run-a?span=gone')
        await appReady()

        expect(
            await screen.findByRole('tree', { name: 'Execution tree' }),
        ).toBeVisible()
        expect(
            screen.queryByRole('region', { name: 'Span evidence' }),
        ).not.toBeInTheDocument()
        await waitFor(() => expect(search().has('span')).toBe(false))
    })

    it('neither pushes nor pops history when the window crosses the breakpoint with a span open', async () => {
        const listeners: (() => void)[] = []
        vi.stubGlobal('matchMedia', (query: string) => ({
            matches: false,
            media: query,
            addEventListener: (_type: string, listener: () => void) => {
                // Only the width query is the test's to fire (the theme listens too).
                if (query.includes('max-width')) {
                    listeners.push(listener)
                }
            },
            removeEventListener: () => {},
        }))
        serve()
        await open('/traces/run-a')
        await userEvent.click(row('search, Completed'))
        const entries = window.history.length
        const where = window.location.href

        for (const width of [1280, 500, 1280]) {
            window.innerWidth = width
            act(() => listeners.forEach((listener) => listener()))
            await act(async () => {
                await Promise.resolve()
            })

            expect(window.history.length).toBe(entries)
            expect(window.location.href).toBe(where)
        }
    })
})
