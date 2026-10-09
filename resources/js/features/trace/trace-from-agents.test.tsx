import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderApp } from '@/test/render-app'
import { makeAgentSpan, makeDetail, mockTraceApi } from '@/test/trace-api'

beforeEach(() => {
    window.Trail = {
        path: '/trail',
        apiPath: '/trail/api',
        csrfToken: 'csrf-1',
    }
})

afterEach(() => {
    delete window.Trail
})

const fromQuery = (from: string) => `?${new URLSearchParams({ from })}`

async function open(search: string) {
    const fetchMock = mockTraceApi({
        r1: makeDetail({ spans: [makeAgentSpan('root', { sequence: 1 })] }),
    })

    renderApp(`/traces/r1${search}`)
    await screen.findByRole('tree', { name: 'Execution tree' })

    return fetchMock
}

describe('a run opened with the agents’ pages as its return target', () => {
    it.each([
        ['the list of agents', '/agents?range=7d&sort=-cost'],
        ['an agent’s page', '/agents/agent?name=SupportAssistant&range=7d'],
    ])(
        'leads back to the plain list of runs, as for no target, when it is %s',
        async (_, from) => {
            const fetchMock = await open(fromQuery(from))
            const links = screen.getAllByRole('link', {
                name: 'Back to traces',
            })

            // The header and the footer: both go to the list, none to the agents.
            expect(links).toHaveLength(2)

            for (const link of links) {
                expect(link).toHaveAttribute('href', '/trail/traces')
            }

            expect(
                screen.queryByRole('link', {
                    name: /Back to (agents|conversation|comparison)/,
                }),
            ).toBeNull()
            // No neighbours to step through: the way back has no list view to ask about.
            expect(
                screen.queryByRole('group', { name: /^Step through/ }),
            ).toBeNull()
            expect(
                fetchMock.mock.calls.filter(([url]) =>
                    url.includes('/neighbours'),
                ),
            ).toEqual([])
        },
    )

    it('still leads back to the list of runs it was opened from', async () => {
        await open(fromQuery('/traces?status=failed&page=2'))

        for (const link of screen.getAllByRole('link', {
            name: 'Back to traces',
        })) {
            expect(link).toHaveAttribute(
                'href',
                '/trail/traces?status=failed&page=2',
            )
        }
    })
})
