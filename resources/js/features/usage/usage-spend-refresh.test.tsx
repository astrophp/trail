import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetUsageRefreshFailures } from '@/features/usage/use-usage'
import { forgetUsageBreakdownRefreshFailures } from '@/features/usage/use-usage-breakdown'
import { forgetUsageSpendRefreshFailures } from '@/features/usage/use-usage-spend'
import { refreshEvery } from '@/lib/refresh-policy'
import { renderApp } from '@/test/render-app'
import {
    deferred,
    json,
    mockApi,
    quietUsageFor,
    spendFor,
    spendUrls,
    usageFor,
    usageUrls,
} from '@/test/usage-api'
import { until } from '@/test/wait'

beforeEach(() => {
    forgetUsageRefreshFailures()
    forgetUsageBreakdownRefreshFailures()
    forgetUsageSpendRefreshFailures()
})

afterEach(() => {
    vi.useRealTimers()
})

const fakeInterval = () =>
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })

async function tick() {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(refreshEvery)
    })
}

const totals = () => screen.findByText('Pricing coverage')

const chartDrawn = () =>
    document.querySelectorAll('path.recharts-line-curve').length > 0

describe('the estimated cost while the totals refresh', () => {
    it('is not asked for again on every tick of the totals, but once when the runs have finished', async () => {
        fakeInterval()
        let quiet = false
        const fetchMock = mockApi((url) =>
            json(quiet ? quietUsageFor(url) : usageFor(url)),
        )
        renderApp('/usage')
        await totals()
        await until(() => expect(spendUrls(fetchMock)).toHaveLength(1))

        for (let times = 2; times <= 4; times++) {
            await tick()
            await until(() => expect(usageUrls(fetchMock)).toHaveLength(times))
        }

        // Four answers of the totals with a run still running: none of them asked for the chart.
        expect(spendUrls(fetchMock)).toHaveLength(1)

        quiet = true
        await tick()
        await until(() => expect(usageUrls(fetchMock)).toHaveLength(5))
        await until(() => expect(spendUrls(fetchMock)).toHaveLength(2))

        await tick()
        await tick()
        expect(spendUrls(fetchMock)).toHaveLength(2)
    })

    it('never asks again when nothing is running', async () => {
        fakeInterval()
        const fetchMock = mockApi((url) => json(quietUsageFor(url)))
        renderApp('/usage')
        await totals()
        await until(() => expect(spendUrls(fetchMock)).toHaveLength(1))

        await tick()
        await tick()
        await tick()

        expect(usageUrls(fetchMock)).toHaveLength(1)
        expect(spendUrls(fetchMock)).toHaveLength(1)
    })

    it('finishes a request that takes longer than a tick, without cancelling it for the next', async () => {
        fakeInterval()
        const slow = deferred()
        const fetchMock = mockApi(
            (url) => json(usageFor(url)),
            undefined,
            undefined,
            undefined,
            () => slow.promise,
        )
        renderApp('/usage')
        await totals()
        await until(() => expect(spendUrls(fetchMock)).toHaveLength(1))

        for (let times = 2; times <= 4; times++) {
            await tick()
            await until(() => expect(usageUrls(fetchMock)).toHaveLength(times))
        }

        const [first] = fetchMock.mock.calls.filter(([url]) =>
            url.includes('/api/usage/spend'),
        )

        // The one request is still the one in flight: no tick started another or cancelled it.
        expect(spendUrls(fetchMock)).toHaveLength(1)
        expect(first?.[1]?.signal?.aborted).toBe(false)

        slow.resolve(new Response(JSON.stringify(spendFor('?range=24h'))))
        await waitFor(() => expect(chartDrawn()).toBe(true))

        expect(spendUrls(fetchMock)).toHaveLength(1)
    })

    it('says once that its own last refresh failed, keeps the chart, and recovers on request with focus kept', async () => {
        fakeInterval()
        let quiet = false
        let healthy = true
        const fetchMock = mockApi(
            (url) => json(quiet ? quietUsageFor(url) : usageFor(url)),
            undefined,
            undefined,
            undefined,
            (url) =>
                healthy ? json(spendFor(url)) : json({ message: 'Down.' }, 500),
        )
        renderApp('/usage')
        await totals()
        await waitFor(() => expect(chartDrawn()).toBe(true))
        await screen.findByText('claude-sonnet-4-5')

        // The runs finish, so the chart is asked for again, and that fails.
        healthy = false
        quiet = true
        await tick()
        await screen.findByText(
            'The last refresh failed. What is shown is from before it.',
        )

        expect(spendUrls(fetchMock)).toHaveLength(2)
        expect(screen.getAllByText(/refresh failed/)).toHaveLength(1)
        expect(chartDrawn()).toBe(true)
        expect(screen.queryByRole('alert')).toBeNull()

        healthy = true

        const button = screen.getByRole('button', { name: 'Try again' })

        button.focus()
        await userEvent.click(button)
        await waitFor(() =>
            expect(screen.queryByText(/refresh failed/)).toBeNull(),
        )

        // The button went away with the note: focus goes to the page heading, not nowhere.
        await waitFor(() =>
            expect(
                screen.getByRole('heading', { level: 1, name: 'Usage & cost' }),
            ).toHaveFocus(),
        )
        expect(chartDrawn()).toBe(true)
    })

    it('leaves the saying to the totals when their refresh failed, and keeps the chart', async () => {
        fakeInterval()
        let fail = false
        const fetchMock = mockApi((url) =>
            fail ? json({ message: 'Down.' }, 500) : json(usageFor(url)),
        )
        renderApp('/usage')
        await totals()
        await waitFor(() => expect(chartDrawn()).toBe(true))
        fail = true

        await tick()
        await until(() => expect(usageUrls(fetchMock)).toHaveLength(2))
        await screen.findByText('The last refresh failed; trying again.')

        expect(screen.getAllByText(/refresh failed/)).toHaveLength(1)
        expect(
            within(
                screen
                    .getByRole('heading', {
                        level: 2,
                        name: 'Estimated cost over time',
                    })
                    .closest('[data-slot="panel"]') as HTMLElement,
            ).queryByRole('button', { name: 'Try again' }),
        ).toBeNull()
        expect(chartDrawn()).toBe(true)
    })
})
