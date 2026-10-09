import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { forgetAgentRefreshFailures } from '@/features/agents/use-agent'
import { forgetBreakdownRefreshFailures } from '@/features/agents/use-agent-breakdown'
import { forgetRecentTracesRefreshFailures } from '@/features/traces'
import {
    breakdownFor,
    breakdownUrls,
    json,
    mockApi,
    panel,
    queryOf,
    recentFor,
    showFor,
    showUrls,
    strip,
    traceUrls,
} from '@/test/agent-page-api'
import { renderApp } from '@/test/render-app'
import { until } from '@/test/wait'

/** What the address says, and what the runs recorded: a different spelling of the same name. */
const typed = 'supportassistant'
const stored = 'Support/Assistant 1'

beforeEach(() => {
    forgetAgentRefreshFailures()
    forgetBreakdownRefreshFailures()
    forgetRecentTracesRefreshFailures()
})

const agentOf = (href: string | null) =>
    new URL(href ?? '', 'http://x').searchParams.get('agent')

const hrefs = (scope: HTMLElement) =>
    within(scope)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href'))

async function open() {
    const fetchMock = mockApi({
        show: (url) => json(showFor(url, { agent: { name: stored } })),
        breakdown: (url) =>
            json(
                breakdownFor(url, {
                    models: [
                        {
                            ...breakdownFor(url).data.models[0],
                            filters: {
                                agent: stored,
                                provider: 'anthropic',
                                model: 'claude-haiku-4-5',
                            },
                        },
                    ],
                    tools: [
                        {
                            ...breakdownFor(url).data.tools[0],
                            filters: { agent: stored, tool: 'search' },
                        },
                    ],
                }),
            ),
    })

    renderApp(`/agents/agent?name=${typed}&range=7d`)
    await screen.findByRole('heading', { level: 1, name: stored })
    await waitFor(() => expect(strip()).not.toBeNull())
    await screen.findByRole('link', { name: /^View all 37/ })

    return fetchMock
}

describe('an agent whose runs spell its name differently from the address', () => {
    it('asks for the agent and its breakdown with the name as the address spells it', async () => {
        const fetchMock = await open()

        expect(queryOf(showUrls(fetchMock)[0] ?? '').get('name')).toBe(typed)
        await until(() => expect(breakdownUrls(fetchMock)).toHaveLength(1))
        expect(queryOf(breakdownUrls(fetchMock)[0] ?? '').get('name')).toBe(
            typed,
        )
    })

    it('is headed by the stored spelling, and so are the tab and the breadcrumb', async () => {
        await open()

        expect(document.title).toBe(`${stored} · Trail`)
        expect(
            within(
                screen.getByRole('navigation', { name: 'breadcrumb' }),
            ).getByText(stored),
        ).toBeVisible()
    })

    it('links "View all traces" with the stored spelling', async () => {
        await open()

        expect(
            agentOf(
                screen
                    .getByRole('link', { name: 'View all traces' })
                    .getAttribute('href'),
            ),
        ).toBe(stored)
    })

    it('links each of the four figures with the stored spelling', async () => {
        await open()
        const found = hrefs(strip() as HTMLElement)

        expect(found).toHaveLength(4)

        for (const href of found) {
            expect(agentOf(href), href ?? '').toBe(stored)
        }
    })

    it('links an attention cell and its issue kind with the stored spelling', async () => {
        await open()
        const found = hrefs(
            (
                await screen.findByRole('heading', { name: 'Needs attention' })
            ).closest('[data-slot="panel"]') as HTMLElement,
        )

        expect(found.length).toBeGreaterThanOrEqual(4)

        for (const href of found) {
            expect(agentOf(href), href ?? '').toBe(stored)
        }
    })

    it('links a model row and a tool row with the stored spelling', async () => {
        await open()
        await screen.findAllByText('claude-haiku-4-5')

        for (const title of ['Models', 'Tools']) {
            const own = within(panel(title))
                .getAllByRole('link')
                .map((link) => link.getAttribute('href'))

            expect(own.length).toBeGreaterThan(0)

            for (const href of own) {
                expect(agentOf(href), href ?? '').toBe(stored)
            }
        }
    })

    it('asks for its recent runs and links all of them with the stored spelling', async () => {
        const fetchMock = await open()

        expect(queryOf(traceUrls(fetchMock).at(-1) ?? '').get('agent')).toBe(
            stored,
        )
        expect(
            agentOf(
                screen
                    .getByRole('link', { name: /^View all 37/ })
                    .getAttribute('href'),
            ),
        ).toBe(stored)
        expect(recentFor('?agent=x').data[0]?.name).toBe('x')
    })
})
