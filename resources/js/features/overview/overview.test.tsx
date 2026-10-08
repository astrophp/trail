import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OverviewResponse, Summary } from '@/api/types'
import { forgetOverviewRefreshFailures } from '@/features/overview/use-overview'
import { maxFailedRefreshes, refreshEvery } from '@/lib/refresh-policy'
import { createQueryClient } from '@/app/providers/query-provider'
import { renderApp } from '@/test/render-app'
import {
    deferred,
    expectSearch,
    json,
    mockApi,
    overviewFixture,
    overviewFor,
    overviewUrls,
    overviewWith,
    paramsOf,
    runs,
} from '@/test/overview-api'

beforeEach(() => {
    forgetOverviewRefreshFailures()
})

afterEach(() => {
    vi.useRealTimers()
})

const labels = ['Traces', 'Error rate', 'p95 duration', 'Estimated cost']

/** The element of a metric, found by its label. */
function metric(label: string): HTMLElement {
    const found = [...document.querySelectorAll('[data-slot="metric"]')].find(
        (element) => element.querySelector('dt')?.textContent === label,
    )

    if (!(found instanceof HTMLElement)) {
        throw new Error(`No metric called ${label}.`)
    }

    return found
}

const valueOf = (label: string) =>
    metric(label).querySelector('dd')?.textContent
const hrefOf = (label: string) =>
    metric(label).querySelector('a')?.getAttribute('href')
const strip = () => document.querySelector('[data-slot="metric-strip"]')
const busy = () => document.querySelector('[aria-busy="true"]')

async function open(route = '/', period = '24 hours') {
    renderApp(route)
    await screen.findAllByText(`vs previous ${period}`)
}

const pickRange = async (name: string) => {
    await userEvent.click(screen.getByRole('combobox', { name: 'Time range' }))
    await userEvent.click(screen.getByRole('option', { name }))
}

const empty: Summary = {
    runs: runs({}),
    error_rate: { rate: null, failed: 0, finished: 0 },
    duration: {
        average_ms: null,
        p95_ms: null,
        measured: 0,
        not_measured: 0,
        p95_minimum: 20,
    },
    usage: { ...overviewFixture.data.summary.usage, state: 'not_reported' },
    usage_coverage: { reported: 0, not_reported: 0 },
    cost: { state: 'not_captured', amount: null },
    cost_coverage: { unpriced_runs: 0, runs_without_amount: 0 },
}

describe('the Overview page', () => {
    it('has the title, a description and the time range, and asks for the default range', async () => {
        const fetchMock = mockApi()
        await open()

        expect(
            screen.getByRole('heading', { level: 1, name: 'Overview' }),
        ).toBeInTheDocument()
        expect(
            screen.getByText('How your agents are doing, at a glance.'),
        ).toBeVisible()
        expect(
            screen.getByRole('combobox', { name: 'Time range' }),
        ).toHaveTextContent('Last 24 hours')
        expect(overviewUrls(fetchMock)).toEqual([
            '/trail/api/overview?range=24h',
        ])
        expect(document.title).toBe('Overview · Trail')
    })

    it('shows the four figures of the fixture in order, each with its own value', async () => {
        mockApi()
        await open()

        expect(
            [...document.querySelectorAll('[data-slot="metric"] dt')].map(
                (label) => label.textContent,
            ),
        ).toEqual(labels)
        expect(valueOf('Traces')).toBe('32')
        expect(valueOf('Error rate')).toBe('3.6%')
        expect(valueOf('p95 duration')).toBe('1.90s')
        expect(valueOf('Estimated cost')).toBe('Pending')
        expect(
            within(metric('Error rate')).getByText('1 failed'),
        ).toBeInTheDocument()
        expect(
            within(metric('Estimated cost')).getByText('2 unpriced runs'),
        ).toBeInTheDocument()
    })

    it('has no empty-range notice for a range with runs', async () => {
        mockApi()
        await open()

        expect(
            screen.queryByText(/No runs were recorded in the selected range/),
        ).toBeNull()
    })

    it('links every figure out with the range and the filter that gives its evidence', async () => {
        mockApi()
        await open('/?range=7d', '7 days')

        expect(hrefOf('Traces')).toBe('/trail/traces?range=7d')
        expect(hrefOf('Error rate')).toBe(
            '/trail/traces?range=7d&status=failed',
        )
        expect(hrefOf('p95 duration')).toBe('/trail/traces?range=7d&slow=1')
        expect(hrefOf('Estimated cost')).toBe(
            '/trail/traces?range=7d&sort=-cost',
        )
    })

    it('has no slow link when there is no percentile, and says what is shown instead', async () => {
        mockApi(() =>
            json(
                overviewWith({
                    duration: {
                        ...overviewFixture.data.summary.duration,
                        p95_ms: null,
                        measured: 4,
                    },
                }),
            ),
        )
        await open()

        expect(valueOf('Avg duration')).toBe('981 ms')
        expect(hrefOf('Avg duration')).toBeUndefined()
        expect(
            within(metric('Avg duration')).getByText(
                'p95 needs 20 measured runs · 4 so far',
            ),
        ).toBeInTheDocument()
        expect(screen.queryByText('p95 duration')).toBeNull()
    })

    describe('the previous period', () => {
        it('is named in the captions of the changes, with no footer repeating it', async () => {
            mockApi()
            await open()

            expect(
                within(metric('Traces')).getByText('vs previous 24 hours'),
            ).toBeInTheDocument()
            expect(screen.queryByText(/Compared with the previous/)).toBeNull()
            expect(
                screen.queryByText(/No runs were recorded in the previous/),
            ).toBeNull()
        })

        it('is said to be empty, and nothing is compared with it', async () => {
            mockApi(() => json(overviewWith({}, null)))
            renderApp('/')
            await screen.findByText(
                'No runs were recorded in the previous 24 hours',
            )

            // Said once, by the footer: no metric draws a change of its own.
            expect(
                strip()?.querySelectorAll('[data-slot="change"]'),
            ).toHaveLength(0)
            expect(strip()?.textContent).not.toMatch(/No earlier|vs previous/)
            expect(screen.getAllByText(/previous 24 hours/)).toHaveLength(1)
        })

        it('draws no change for a figure that has no value now', async () => {
            mockApi(() =>
                json(
                    overviewWith({
                        error_rate: { rate: null, failed: 0, finished: 0 },
                    }),
                ),
            )
            await open()

            expect(
                metric('Error rate').querySelector('[data-slot="change"]'),
            ).toBeNull()
            expect(
                metric('Traces').querySelector('[data-slot="change"]'),
            ).not.toBeNull()
        })
    })

    describe('a range with no runs', () => {
        beforeEach(() => {
            mockApi(() => json(overviewWith(empty, null)))
        })

        it('says so, keeps the count of 0 and shows the others as missing', async () => {
            renderApp('/')
            await screen.findByText(
                'No runs were recorded in the selected range.',
            )

            expect(valueOf('Traces')).toBe('0')
            expect(valueOf('Error rate')).toBe('No finished runs')
            expect(valueOf('Avg duration')).toBe('No measured runs')
            expect(valueOf('Estimated cost')).toBe('Not captured')
            expect(strip()?.textContent).not.toMatch(/0%/)
            expect(
                screen.getByText(
                    'No runs were recorded in the previous 24 hours',
                ),
            ).toBeVisible()
        })

        it('is not the first-run screen', async () => {
            renderApp('/')
            await screen.findByText(
                'No runs were recorded in the selected range.',
            )

            expect(
                screen.getByRole('heading', { level: 1, name: 'Overview' }),
            ).toBeInTheDocument()
            expect(strip()).not.toBeNull()
        })
    })

    describe('loading', () => {
        it('draws a skeleton of four metrics and no figures', async () => {
            const slow = deferred()
            mockApi(() => slow.promise)
            renderApp('/')

            await waitFor(() =>
                expect(
                    document.querySelectorAll('[data-slot="metric-skeleton"]'),
                ).toHaveLength(4),
            )
            expect(strip()).toBeNull()

            slow.resolve(await json(overviewFor('/api/overview?range=24h')))
            await screen.findAllByText('vs previous 24 hours')

            expect(
                document.querySelector('[data-slot="metric-strip-skeleton"]'),
            ).toBeNull()
        })
    })

    describe('a failed request', () => {
        it('with no data says so and the retry asks again', async () => {
            let attempts = 0
            const fetchMock = mockApi((url) => {
                attempts++

                return attempts === 1
                    ? json({ message: 'Overview is down.' }, 500)
                    : json(overviewFor(url))
            })
            renderApp('/')

            const alert = await screen.findByRole('alert')

            expect(
                within(alert).getByRole('heading', {
                    level: 2,
                    name: 'The overview could not be loaded',
                }),
            ).toBeInTheDocument()
            expect(within(alert).getByText('Overview is down.')).toBeVisible()
            expect(strip()).toBeNull()

            await userEvent.click(
                within(alert).getByRole('button', { name: 'Try again' }),
            )
            await screen.findAllByText('vs previous 24 hours')

            expect(screen.queryByRole('alert')).toBeNull()
            expect(overviewUrls(fetchMock)).toHaveLength(2)
            expect(valueOf('Traces')).toBe('32')
        })

        it('keeps the retry button on screen while the retry runs', async () => {
            const retry = deferred()
            let attempts = 0
            mockApi((url) => {
                attempts++

                return attempts === 1
                    ? json({ message: 'Down.' }, 500)
                    : attempts === 2
                      ? retry.promise
                      : json(overviewFor(url))
            })
            renderApp('/')

            const button = await screen.findByRole('button', {
                name: 'Try again',
            })
            button.focus()
            await userEvent.click(button)

            expect(
                await screen.findByRole('button', { name: 'Trying again…' }),
            ).toHaveFocus()
            expect(strip()).toBeNull()

            retry.resolve(await json(overviewFor('/api/overview?range=24h')))
            await screen.findAllByText('vs previous 24 hours')
        })

        it('after data was shown keeps the data and says the refresh failed', async () => {
            let fail = false
            mockApi((url) =>
                fail ? json({ message: 'Down.' }, 500) : json(overviewFor(url)),
            )
            await open()
            fail = true

            await userEvent.click(
                screen.getByRole('button', { name: 'Refresh' }),
            )
            // Runs are running, so the page goes on asking.
            await screen.findByText('The last refresh failed; trying again.')

            expect(valueOf('Traces')).toBe('32')
            expect(screen.queryByRole('alert')).toBeNull()
            expect(busy()).toBeNull()
        })

        it('with nothing running says what is shown is from before it', async () => {
            let fail = false
            mockApi(() =>
                fail
                    ? json({ message: 'Down.' }, 500)
                    : json(overviewWith({ runs: runs({ completed: 32 }) })),
            )
            await open()
            expect(screen.queryByText(/The last refresh failed/)).toBeNull()
            fail = true

            await userEvent.click(
                screen.getByRole('button', { name: 'Refresh' }),
            )
            await screen.findByText(
                'The last refresh failed. What is shown is from before it.',
            )

            expect(valueOf('Traces')).toBe('32')
        })

        it('does not follow a change of range', async () => {
            let fail = false
            mockApi((url) =>
                fail ? json({ message: 'Down.' }, 500) : json(overviewFor(url)),
            )
            await open()
            fail = true
            await userEvent.click(
                screen.getByRole('button', { name: 'Refresh' }),
            )
            await screen.findByText(/The last refresh failed/)

            const next = deferred()
            fail = false
            mockApi((url) =>
                paramsOf(url).range === '7d'
                    ? next.promise
                    : json(overviewFor(url)),
            )
            await pickRange('Last 7 days')
            await waitFor(() => expect(busy()).not.toBeNull())

            // While the next range loads, and once it has arrived.
            expect(screen.queryByText(/The last refresh failed/)).toBeNull()

            next.resolve(await json(overviewFor('/api/overview?range=7d')))
            await screen.findAllByText('vs previous 7 days')

            expect(screen.queryByText(/The last refresh failed/)).toBeNull()
        })

        it("for a new range shows the error and not the old range's figures", async () => {
            mockApi((url) =>
                paramsOf(url).range === '7d'
                    ? json({ message: 'Down.' }, 500)
                    : json(overviewFor(url)),
            )
            await open()
            await pickRange('Last 7 days')

            await screen.findByRole('alert')

            expect(strip()).toBeNull()
            expect(screen.queryByText('vs previous 24 hours')).toBeNull()
        })
    })

    describe('the range', () => {
        it('is chosen in the select, kept in the URL and asked of the API', async () => {
            const fetchMock = mockApi()
            await open()

            await pickRange('Last 7 days')
            await expectSearch('?range=7d')
            await screen.findAllByText('vs previous 7 days')

            expect(overviewUrls(fetchMock).at(-1)).toBe(
                '/trail/api/overview?range=7d',
            )
            expect(
                within(metric('Traces')).getByText('vs previous 7 days'),
            ).toBeInTheDocument()

            await pickRange('Last hour')
            await expectSearch('?range=1h')
            await screen.findAllByText('vs previous hour')

            expect(
                within(metric('Traces')).getByText('vs previous hour'),
            ).toBeInTheDocument()
        })

        it("keeps the previous range's figures dimmed, with their own words and links, until the next arrive", async () => {
            const next = deferred()
            mockApi((url) =>
                paramsOf(url).range === '7d'
                    ? next.promise
                    : json(overviewFor(url)),
            )
            await open()
            expect(busy()).toBeNull()

            await pickRange('Last 7 days')
            await expectSearch('?range=7d')

            await waitFor(() => expect(busy()).not.toBeNull())
            const dimmed = busy() as HTMLElement

            expect(dimmed).toHaveClass('opacity-60')
            expect(dimmed).toContainElement(strip() as HTMLElement)
            expect(valueOf('Traces')).toBe('32')
            expect(
                within(metric('Traces')).getByText('vs previous 24 hours'),
            ).toBeInTheDocument()
            expect(strip()?.textContent).not.toMatch(/7 days/)
            expect(hrefOf('Traces')).toBe('/trail/traces')
            expect(hrefOf('Error rate')).toBe('/trail/traces?status=failed')
            // The announcement is outside the busy part, where a screen reader may mute it.
            const status = screen.getByRole('status')

            expect(status).toHaveTextContent('Loading')
            expect(dimmed).not.toContainElement(status)

            next.resolve(
                await json(
                    overviewWith({ runs: runs({ completed: 7 }) }, null, '7d'),
                ),
            )
            await screen.findByText(
                'No runs were recorded in the previous 7 days',
            )

            expect(busy()).toBeNull()
            expect(strip()).not.toHaveClass('opacity-60')
            expect(valueOf('Traces')).toBe('7')
            expect(hrefOf('Traces')).toBe('/trail/traces?range=7d')
            expect(screen.getByRole('status')).toBeEmptyDOMElement()
        })

        it('draws an empty answer for the next range only once it has arrived', async () => {
            const next = deferred()
            mockApi((url) =>
                paramsOf(url).range === '1h'
                    ? next.promise
                    : json(overviewFor(url)),
            )
            await open()
            await pickRange('Last hour')
            await waitFor(() => expect(busy()).not.toBeNull())

            expect(
                screen.queryByText(
                    'No runs were recorded in the selected range.',
                ),
            ).toBeNull()

            next.resolve(await json(overviewWith(empty, null, '1h')))
            await screen.findByText(
                'No runs were recorded in the selected range.',
            )
        })
    })
})

describe('refreshing by itself', () => {
    const fakeInterval = () =>
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })

    async function tick(times = 1) {
        for (let i = 0; i < times; i++) {
            await act(async () => {
                await vi.advanceTimersByTimeAsync(refreshEvery)
            })
        }
    }

    const nothingRunning: OverviewResponse = overviewWith({
        runs: runs({ completed: 32 }),
    })

    it('asks again every two seconds while a run is running, and stops when none is', async () => {
        fakeInterval()
        let answers: OverviewResponse = overviewFixture
        const fetchMock = mockApi(() => json(answers))
        await open()
        expect(overviewUrls(fetchMock)).toHaveLength(1)

        await tick()
        expect(overviewUrls(fetchMock)).toHaveLength(2)

        answers = nothingRunning
        await tick()
        await waitFor(() => expect(valueOf('Traces')).toBe('32'))
        expect(overviewUrls(fetchMock)).toHaveLength(3)

        await tick(3)
        expect(overviewUrls(fetchMock)).toHaveLength(3)
    })

    it('never asks when nothing is running', async () => {
        fakeInterval()
        const fetchMock = mockApi(() => json(nothingRunning))
        await open()

        await tick(3)

        expect(overviewUrls(fetchMock)).toHaveLength(1)
    })

    it('gives up after repeated failures, says so and starts again on request', async () => {
        fakeInterval()
        let fail = false
        const fetchMock = mockApi(() =>
            fail ? json({ message: 'Down.' }, 500) : json(overviewFixture),
        )
        await open()
        fail = true

        await tick(maxFailedRefreshes)
        await screen.findByText('Refreshing stopped after repeated failures.')

        const asked = overviewUrls(fetchMock).length

        expect(asked).toBe(1 + maxFailedRefreshes)
        expect(valueOf('Traces')).toBe('32')

        await tick(3)
        expect(overviewUrls(fetchMock)).toHaveLength(asked)

        fail = false
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
        await waitFor(() =>
            expect(screen.queryByText(/Refreshing stopped/)).toBeNull(),
        )
        // The button went away with the notice: focus goes to the page heading.
        await waitFor(() =>
            expect(
                screen.getByRole('heading', { level: 1, name: 'Overview' }),
            ).toHaveFocus(),
        )
        await tick()

        // The retry itself, then the first tick of the interval that started again.
        expect(overviewUrls(fetchMock)).toHaveLength(asked + 2)
    })
})

describe('what a range owns', () => {
    const fakeInterval = () =>
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })

    const tick = async () => {
        await act(async () => {
            await vi.advanceTimersByTimeAsync(refreshEvery)
        })
    }

    it("says nothing about stopped refreshing over another range's placeholder data", async () => {
        // B (7 days) fails its first load and two retries: its ledger is at the limit.
        const reload = deferred()
        let sevenDays: 'fails' | 'loads' = 'fails'
        mockApi((url) =>
            paramsOf(url).range === '7d'
                ? sevenDays === 'fails'
                    ? json({ message: 'Down.' }, 500)
                    : reload.promise
                : json(overviewFor(url)),
        )
        renderApp('/?range=7d')
        await screen.findByRole('alert')

        for (let times = 1; times < maxFailedRefreshes; times++) {
            await userEvent.click(
                screen.getByRole('button', { name: 'Try again' }),
            )
            await waitFor(() =>
                expect(
                    screen.getByRole('button', { name: 'Try again' }),
                ).toBeInTheDocument(),
            )
        }

        // A (24 hours) has runs running. Back to B: A's figures stay, dimmed, while B loads.
        await pickRange('Last 24 hours')
        await screen.findAllByText('vs previous 24 hours')
        sevenDays = 'loads'
        await pickRange('Last 7 days')
        await waitFor(() => expect(busy()).not.toBeNull())

        expect(valueOf('Traces')).toBe('32')
        expect(screen.queryByText(/Refreshing stopped/)).toBeNull()
        expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    })

    it('shows the skeleton for a range still loading, not the error of the one before', async () => {
        const second = deferred()
        mockApi((url) =>
            paramsOf(url).range === '7d'
                ? json({ message: 'Seven days are down.' }, 500)
                : second.promise,
        )
        renderApp('/?range=7d')
        await screen.findByRole('alert')

        await pickRange('Last hour')
        await waitFor(() =>
            expect(
                document.querySelectorAll('[data-slot="metric-skeleton"]'),
            ).toHaveLength(4),
        )

        expect(screen.queryByRole('alert')).toBeNull()
        expect(screen.queryByText('Trying again…')).toBeNull()

        // Its own failure shows its own message, never the other range's.
        second.resolve(await json({ message: 'An hour is down.' }, 500))
        const alert = await screen.findByRole('alert')

        expect(within(alert).getByText('An hour is down.')).toBeVisible()
        expect(screen.queryByText('Seven days are down.')).toBeNull()
    })

    it("does not stop one range's refreshing because another one failed", async () => {
        fakeInterval()
        let sevenDaysFail = false
        const fetchMock = mockApi((url) =>
            paramsOf(url).range === '7d' && sevenDaysFail
                ? json({ message: 'Down.' }, 500)
                : json(overviewFor(url)),
        )
        await open()
        sevenDaysFail = true
        await pickRange('Last 7 days')
        await screen.findByRole('alert')

        for (let times = 1; times < maxFailedRefreshes; times++) {
            await userEvent.click(
                screen.getByRole('button', { name: 'Try again' }),
            )
            await waitFor(() =>
                expect(
                    screen.getByRole('button', { name: 'Try again' }),
                ).toBeInTheDocument(),
            )
        }

        await pickRange('Last 24 hours')
        await screen.findAllByText('vs previous 24 hours')
        const asked = overviewUrls(fetchMock).filter(
            (url) => paramsOf(url).range === '24h',
        ).length

        await tick()
        await tick()

        expect(
            overviewUrls(fetchMock).filter(
                (url) => paramsOf(url).range === '24h',
            ),
        ).toHaveLength(asked + 2)
        expect(screen.queryByText(/Refreshing stopped/)).toBeNull()
    })
})

describe('retrying', () => {
    const nothingRunning = overviewWith({ runs: runs({ completed: 32 }) })
    const offline = () => Promise.reject(new TypeError('offline'))

    it('does not repeat a failed refresh while figures are on screen', async () => {
        let online = true
        const fetchMock = mockApi((url) =>
            online
                ? json({ ...nothingRunning, range: overviewFor(url).range })
                : offline(),
        )
        renderApp('/', {}, createQueryClient())
        await screen.findAllByText('vs previous 24 hours')
        online = false

        await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))
        await screen.findByText(
            'The last refresh failed. What is shown is from before it.',
        )

        expect(overviewUrls(fetchMock)).toHaveLength(2)
    })

    it('repeats a first load that got no response, as configured', async () => {
        const fetchMock = mockApi(offline)
        renderApp('/', {}, createQueryClient())

        await screen.findByRole('alert')

        // The first request and the two repeats the app's client allows.
        expect(overviewUrls(fetchMock)).toHaveLength(3)
    })
})

describe('an empty range', () => {
    it.each([
        ['1h', true],
        ['24h', true],
        ['7d', false],
    ] as const)('for %s %s a longer range to try', async (range, suggests) => {
        mockApi(() => json(overviewWith(empty, null, range)))
        renderApp(`/?range=${range}`)

        const notice = await screen.findByText(
            'No runs were recorded in the selected range.',
        )

        expect(
            within(
                notice.closest('[data-slot="notice"]') as HTMLElement,
            ).queryByText('Try a longer range.') !== null,
        ).toBe(suggests)
    })
})
