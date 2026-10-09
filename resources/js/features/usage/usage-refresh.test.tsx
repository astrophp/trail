import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetUsageRefreshFailures } from '@/features/usage/use-usage'
import { forgetUsageBreakdownRefreshFailures } from '@/features/usage/use-usage-breakdown'
import { maxFailedRefreshes, refreshEvery } from '@/lib/refresh-policy'
import { renderApp } from '@/test/render-app'
import { until } from '@/test/wait'
import {
    breakdownFor,
    breakdownUrls,
    deferred,
    json,
    mockApi,
    quietUsageFor,
    usageFor,
    usageUrls,
} from '@/test/usage-api'

beforeEach(() => {
    forgetUsageRefreshFailures()
    forgetUsageBreakdownRefreshFailures()
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
const waiting = () =>
    screen.queryByText('Updates when the runs in flight finish')

describe('refreshing by itself', () => {
    it('asks for the totals every tick while a run is running and stops when none is', async () => {
        fakeInterval()
        let quiet = false
        const fetchMock = mockApi((url) =>
            json(quiet ? quietUsageFor(url) : usageFor(url)),
        )
        renderApp('/usage')
        await totals()
        expect(usageUrls(fetchMock)).toHaveLength(1)

        await tick()
        await until(() => expect(usageUrls(fetchMock)).toHaveLength(2))
        await tick()
        await until(() => expect(usageUrls(fetchMock)).toHaveLength(3))

        quiet = true
        await tick()
        await until(() => expect(usageUrls(fetchMock)).toHaveLength(4))

        await tick()
        await tick()
        await tick()
        expect(usageUrls(fetchMock)).toHaveLength(4)
    })

    it('never asks again when nothing is running', async () => {
        fakeInterval()
        const fetchMock = mockApi((url) => json(quietUsageFor(url)))
        renderApp('/usage')
        await totals()
        await until(() => expect(breakdownUrls(fetchMock)).toHaveLength(1))

        await tick()
        await tick()
        await tick()

        expect(usageUrls(fetchMock)).toHaveLength(1)
        expect(breakdownUrls(fetchMock)).toHaveLength(1)
    })

    it('does not ask for the breakdown on every tick, but once when the runs have finished', async () => {
        fakeInterval()
        let quiet = false
        const fetchMock = mockApi((url) =>
            json(quiet ? quietUsageFor(url) : usageFor(url)),
        )
        renderApp('/usage')
        await totals()
        await until(() => expect(breakdownUrls(fetchMock)).toHaveLength(1))

        await tick()
        await tick()
        await until(() => expect(usageUrls(fetchMock)).toHaveLength(3))

        // Three answers of the totals with a run still running: none of them asked for the breakdown.
        expect(breakdownUrls(fetchMock)).toHaveLength(1)

        quiet = true
        await tick()
        await until(() => expect(usageUrls(fetchMock)).toHaveLength(4))
        await until(() => expect(breakdownUrls(fetchMock)).toHaveLength(2))

        await tick()
        await tick()
        expect(breakdownUrls(fetchMock)).toHaveLength(2)
    })

    it('says the rows wait for the runs in flight, until they have finished', async () => {
        fakeInterval()
        let quiet = false
        mockApi((url) => json(quiet ? quietUsageFor(url) : usageFor(url)))
        renderApp('/usage')
        await totals()
        await screen.findByText('claude-sonnet-4-5')

        expect(waiting()).toBeVisible()

        quiet = true
        await tick()
        await waitFor(() => expect(waiting()).toBeNull())
        expect(screen.getByText('claude-sonnet-4-5')).toBeVisible()
    })

    it('finishes a breakdown that takes longer than a tick, without cancelling it for the next', async () => {
        fakeInterval()
        const slow = deferred()
        const fetchMock = mockApi(
            (url) => json(usageFor(url)),
            () => slow.promise,
        )
        renderApp('/usage')
        await totals()
        await until(() => expect(breakdownUrls(fetchMock)).toHaveLength(1))

        for (let times = 2; times <= 4; times++) {
            await tick()
            await until(() => expect(usageUrls(fetchMock)).toHaveLength(times))
        }

        // The one request is still the one in flight: no tick started another or cancelled it.
        expect(breakdownUrls(fetchMock)).toHaveLength(1)

        slow.resolve(
            await json(breakdownFor(breakdownUrls(fetchMock)[0] ?? '')),
        )
        await screen.findByText('claude-sonnet-4-5')

        expect(breakdownUrls(fetchMock)).toHaveLength(1)
    })

    it('says once that the last refresh failed, and offers one way to try again', async () => {
        fakeInterval()
        let fail = false
        const fetchMock = mockApi((url) =>
            fail ? json({ message: 'Down.' }, 500) : json(usageFor(url)),
        )
        renderApp('/usage')
        await totals()
        fail = true

        await tick()
        await until(() => expect(usageUrls(fetchMock)).toHaveLength(2))
        await screen.findByText('The last refresh failed; trying again.')

        expect(screen.getAllByText(/refresh failed/)).toHaveLength(1)
        // What was shown stays, and nothing replaces it with an error.
        expect(screen.queryByRole('alert')).toBeNull()
        expect(screen.getByText('claude-sonnet-4-5')).toBeVisible()
    })

    it('says the last refresh of the breakdown failed while the totals are fine, and recovers on request with focus kept', async () => {
        fakeInterval()
        let quiet = false
        let healthy = true
        mockApi(
            (url) => json(quiet ? quietUsageFor(url) : usageFor(url)),
            (url) =>
                healthy
                    ? json(breakdownFor(url))
                    : json({ message: 'Down.' }, 500),
        )
        renderApp('/usage')
        await totals()
        await screen.findByText('claude-sonnet-4-5')

        // The runs finish, so the breakdown is asked for again, and that fails.
        healthy = false
        quiet = true
        await tick()
        await screen.findByText(
            'The last refresh failed. What is shown is from before it.',
        )

        expect(screen.getAllByText(/refresh failed/)).toHaveLength(1)
        expect(screen.getByText('claude-sonnet-4-5')).toBeVisible()
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
        expect(screen.getByText('claude-sonnet-4-5')).toBeVisible()
    })

    it('gives up after repeated failures, says so and starts again on request', async () => {
        fakeInterval()
        let fail = false
        const fetchMock = mockApi((url) =>
            fail ? json({ message: 'Down.' }, 500) : json(usageFor(url)),
        )
        renderApp('/usage')
        await totals()
        fail = true

        for (let failed = 1; failed <= maxFailedRefreshes; failed++) {
            await tick()
            await until(() =>
                expect(usageUrls(fetchMock)).toHaveLength(1 + failed),
            )
        }

        await screen.findByText('Refreshing stopped after repeated failures.')

        const asked = usageUrls(fetchMock).length

        await tick()
        await tick()
        expect(usageUrls(fetchMock)).toHaveLength(asked)

        fail = false
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
        await waitFor(() =>
            expect(screen.queryByText(/Refreshing stopped/)).toBeNull(),
        )
        // The button went away with the notice: focus goes to the page heading.
        await waitFor(() =>
            expect(
                screen.getByRole('heading', { level: 1, name: 'Usage & cost' }),
            ).toHaveFocus(),
        )
        await until(() => expect(usageUrls(fetchMock)).toHaveLength(asked + 1))
    })
})
