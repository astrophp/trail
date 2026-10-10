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

describe('a run opened with the list of agents as its return target', () => {
    it('leads back to the plain list of runs, as for no target', async () => {
        const fetchMock = await open(fromQuery('/agents?range=7d&sort=-cost'))
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
                name: /Back to (agent|conversation|comparison)/,
            }),
        ).toBeNull()
        // No neighbours to step through: the way back has no list view to ask about.
        expect(
            screen.queryByRole('group', { name: /^Step through/ }),
        ).toBeNull()
        expect(
            fetchMock.mock.calls.filter(([url]) => url.includes('/neighbours')),
        ).toEqual([])
    })

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

describe('a run opened with an agent’s page as its return target', () => {
    const from = '/agents/agent?name=Support%20%2F%20Bot&range=7d&chart=cost'

    it('leads back to that page, with its range and chart mode, from the header and the footer', async () => {
        await open(fromQuery(from))
        const links = screen.getAllByRole('link', { name: 'Back to agent' })

        expect(links).toHaveLength(2)

        for (const link of links) {
            expect(link).toHaveAttribute('href', `/trail${from}`)
        }

        expect(
            screen.queryByRole('link', { name: 'Back to traces' }),
        ).toBeNull()
    })

    it('has no neighbours to step through, and asks for none', async () => {
        const fetchMock = await open(fromQuery(from))

        expect(
            screen.queryByRole('group', { name: /^Step through/ }),
        ).toBeNull()
        expect(
            fetchMock.mock.calls.filter(([url]) => url.includes('/neighbours')),
        ).toEqual([])
    })

    it('is not honoured when it is not a path of the dashboard', async () => {
        await open(fromQuery('//example.com/agents/agent?name=a'))

        for (const link of screen.getAllByRole('link', {
            name: 'Back to traces',
        })) {
            expect(link).toHaveAttribute('href', '/trail/traces')
        }

        expect(screen.queryByRole('link', { name: 'Back to agent' })).toBeNull()
    })
})
