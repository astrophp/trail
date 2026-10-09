import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { forgetAgentRefreshFailures } from '@/features/agents/use-agent'
import { forgetBreakdownRefreshFailures } from '@/features/agents/use-agent-breakdown'
import { forgetRecentTracesRefreshFailures } from '@/features/traces'
import { mockApi, json, strip } from '@/test/agent-page-api'
import { renderApp } from '@/test/render-app'
import { makeAgentSpan, makeDetail } from '@/test/trace-api'

beforeEach(() => {
    window.Trail = {
        path: '/trail',
        apiPath: '/trail/api',
        csrfToken: 'csrf-1',
    }
    forgetAgentRefreshFailures()
    forgetBreakdownRefreshFailures()
    forgetRecentTracesRefreshFailures()
})

afterEach(() => {
    delete window.Trail
})

/** The first run of the recent traces, as a link. */
async function firstRun() {
    const recent = (
        await screen.findByRole('heading', {
            name: 'Recent traces',
        })
    ).closest('section') as HTMLElement

    await waitFor(() =>
        expect(
            within(recent)
                .getAllByRole('link')
                .some((link) => link.getAttribute('href')?.includes('/run-0')),
        ).toBe(true),
    )

    return within(recent)
        .getAllByRole('link')
        .find((link) =>
            link.getAttribute('href')?.includes('/run-0'),
        ) as HTMLElement
}

const agentPage = '/agents/agent?name=Support%2FBot&range=7d&chart=cost'

function open(route: string) {
    return mockApi({
        other: (url) =>
            /\/api\/traces\/run-\d+$/.test(url)
                ? json(
                      makeDetail({
                          spans: [makeAgentSpan('root', { sequence: 1 })],
                      }),
                  )
                : json({}, 404),
    }).mockName(route)
}

describe('a run opened from an agent’s page', () => {
    it('leads back to that page with its range and its chart mode, and the page is as it was left', async () => {
        open(agentPage)
        renderApp(agentPage)
        await waitFor(() => expect(strip()).not.toBeNull())
        await screen.findByRole('heading', { name: 'Recent traces' })

        const first = await firstRun()

        await userEvent.click(first)

        await screen.findByRole('tree', { name: 'Execution tree' })

        // The way back says where it goes, in the header and in the footer.
        const links = screen.getAllByRole('link', { name: 'Back to agent' })

        expect(links).toHaveLength(2)
        expect(
            screen.queryByRole('link', { name: 'Back to traces' }),
        ).toBeNull()

        await userEvent.click(links[0])

        expect(
            await screen.findByRole('heading', {
                level: 1,
                name: 'Support/Bot',
            }),
        ).toBeVisible()
        expect(
            Object.fromEntries(new URLSearchParams(window.location.search)),
        ).toEqual({ name: 'Support/Bot', range: '7d', chart: 'cost' })
        await waitFor(() => expect(strip()).not.toBeNull())
        expect(screen.getByRole('radio', { name: 'Cost' })).toBeChecked()
        expect(screen.getByRole('combobox')).toHaveTextContent('Last 7 days')
    })

    it('takes the browser’s Back to the same place', async () => {
        open(agentPage)
        renderApp(agentPage)
        await screen.findByRole('heading', { name: 'Recent traces' })
        await waitFor(() => expect(strip()).not.toBeNull())

        await userEvent.click(await firstRun())
        await screen.findByRole('tree', { name: 'Execution tree' })

        window.history.back()

        await screen.findByRole('heading', { level: 1, name: 'Support/Bot' })
        expect(window.location.search).toContain('chart=cost')
    })
})
