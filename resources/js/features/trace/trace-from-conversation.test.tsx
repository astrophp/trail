import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { conversationId, conversationServer } from '@/test/conversation-server'
import { renderApp } from '@/test/render-app'
import { turnOf } from '@/test/transcript-api'

beforeEach(() => {
    window.Trail = {
        path: '/trail',
        apiPath: '/trail/api',
        csrfToken: 'csrf-1',
    }
})

afterEach(() => {
    delete window.Trail
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

const turnsOf = (count: number) =>
    Array.from({ length: count }, (_, index) => turnOf(`r${index + 1}`))

const here = (id: string, turn: string, extra = '') =>
    `/conversations/transcript?${new URLSearchParams({ id, turn })}${extra}`
const fromQuery = (from: string, extra = '') =>
    `?${new URLSearchParams({ from })}${extra}`

async function open(path: string) {
    renderApp(path)
    await screen.findByRole('tree', { name: 'Execution tree' })
}

const search = () => new URLSearchParams(window.location.search)
const backLinks = () =>
    screen.getAllByRole('link', { name: 'Back to conversation' })
const previous = () => screen.getByLabelText('Previous turn')
const next = () => screen.getByLabelText('Next turn')
const stepper = () =>
    screen.getByRole('group', { name: 'Step through the conversation' })
const settled = (get: () => HTMLElement, disabled: boolean) =>
    waitFor(() =>
        expect(get().getAttribute('aria-disabled') === 'true').toBe(disabled),
    )

describe('a run opened from a conversation', () => {
    it('leads back to the conversation at that turn, from the header and the footer', async () => {
        conversationServer(turnsOf(5))
        const from = here(conversationId, 'r3')

        await open(`/traces/r3${fromQuery(from)}`)

        expect(backLinks()).toHaveLength(2)

        for (const link of backLinks()) {
            expect(link).toHaveAttribute('href', `/trail${from}`)
        }

        expect(
            screen.queryByRole('link', { name: 'Back to traces' }),
        ).toBeNull()
    })

    it('leaves the breadcrumb on the list of runs, which is the page above a run', async () => {
        conversationServer(turnsOf(5))
        await open(`/traces/r3${fromQuery(here(conversationId, 'r3'))}`)

        expect(
            within(
                screen.getByRole('navigation', { name: 'breadcrumb' }),
            ).getByRole('link', { name: 'Traces' }),
        ).toHaveAttribute('href', '/trail/traces')
    })

    it.each([
        ['an id with a slash and a space', 'support/ada 1042'],
        ['non-ASCII characters', 'günlük/日本語'],
        ['the longest id: 255 non-ASCII characters', '日'.repeat(255)],
    ])('reads the way back for %s', async (_name, id) => {
        conversationServer(turnsOf(5))
        const from = here(id, 'r3')

        await open(`/traces/r3${fromQuery(from)}`)

        for (const link of backLinks()) {
            expect(link).toHaveAttribute('href', `/trail${from}`)
        }

        expect(link(backLinks()[0]).searchParams.get('id')).toBe(id)
    })

    it.each([
        [
            'an address outside the dashboard',
            'https://evil.example/conversations/transcript?id=x',
        ],
        [
            'a protocol-relative address',
            '//evil.example/conversations/transcript?id=x',
        ],
        ['a page that is not a route', '/conversations/transcript/more?id=x'],
        [
            'a conversation page with a from of its own',
            '/conversations/transcript?id=x&from=%2Ftraces',
        ],
    ])('does not follow %s', async (_name, from) => {
        conversationServer(turnsOf(5))

        await open(`/traces/r3${fromQuery(from)}`)

        for (const back of screen.getAllByRole('link', {
            name: 'Back to traces',
        })) {
            expect(back).toHaveAttribute('href', '/trail/traces')
        }

        expect(
            screen.queryByRole('link', { name: 'Back to conversation' }),
        ).toBeNull()
        expect(
            screen.queryByRole('group', {
                name: 'Step through the conversation',
            }),
        ).toBeNull()
    })
})

function link(element: HTMLElement) {
    return new URL(element.getAttribute('href') ?? '', 'http://x')
}

describe('stepping through a conversation', () => {
    it('is labelled for turns, and asks the conversation alone: no range, no filter', async () => {
        const server = conversationServer(turnsOf(5))
        // A link built for the list could carry anything of the list's.
        const from = here(
            conversationId,
            'r3',
            '&range=7d&status=failed&sort=-cost&page=2&search=x',
        )

        await open(`/traces/r3${fromQuery(from)}`)
        await settled(next, false)

        expect(server.neighbours()).toEqual(['r3?within=conversation'])
        expect(previous()).toHaveAttribute('title', 'Previous turn (k)')
        expect(next()).toHaveAttribute('title', 'Next turn (j)')
        expect(
            screen.queryByRole('group', { name: 'Step through the list' }),
        ).toBeNull()
        expect(screen.queryByLabelText('Previous trace')).toBeNull()
    })

    it('opens the turn stepped to with the conversation as the way back, at that turn, and nothing else of this page', async () => {
        conversationServer(turnsOf(5))
        const from = here(conversationId, 'r3')

        await open(`/traces/r3${fromQuery(from, '&span=root&tab=output')}`)
        await settled(next, false)

        const entries = window.history.length

        await userEvent.click(next())
        await screen.findByRole('tree', { name: 'Execution tree' })

        expect(window.location.pathname).toBe('/trail/traces/r4')
        expect([...search().keys()]).toEqual(['from'])
        expect(search().get('from')).toBe(here(conversationId, 'r4'))
        // A step is a place to come back to, as in a list.
        expect(window.history.length).toBe(entries + 1)
        for (const back of backLinks()) {
            expect(back).toHaveAttribute(
                'href',
                `/trail${here(conversationId, 'r4')}`,
            )
        }
        await waitFor(() =>
            expect(screen.getByRole('heading', { level: 1 })).toHaveFocus(),
        )
    })

    it('keeps a "Show tools" switch of the way back and steps back too', async () => {
        conversationServer(turnsOf(5))
        const from = `/conversations/transcript?${new URLSearchParams({ id: conversationId, tools: '0', turn: 'r3' })}`

        await open(`/traces/r3${fromQuery(from)}`)
        await settled(previous, false)
        await userEvent.click(previous())
        await screen.findByRole('tree', { name: 'Execution tree' })

        expect(window.location.pathname).toBe('/trail/traces/r2')
        expect(search().get('from')).toBe(
            `/conversations/transcript?id=support%2Fada+1042&tools=0&turn=r2`,
        )
    })

    it('rewrites the turn each time, so a second step does not pile up the first', async () => {
        conversationServer(turnsOf(5))

        await open(`/traces/r2${fromQuery(here(conversationId, 'r2'))}`)
        await settled(next, false)
        await userEvent.click(next())
        await screen.findByRole('link', { name: 'Next turn' })
        await waitFor(() =>
            expect(window.location.pathname).toBe('/trail/traces/r3'),
        )
        await settled(next, false)
        await userEvent.click(next())
        await waitFor(() =>
            expect(window.location.pathname).toBe('/trail/traces/r4'),
        )

        expect(search().getAll('from')).toEqual([here(conversationId, 'r4')])
    })

    it('steps with the keyboard shortcuts', async () => {
        conversationServer(turnsOf(5))

        await open(`/traces/r3${fromQuery(here(conversationId, 'r3'))}`)
        await settled(next, false)
        await userEvent.keyboard('j')

        await waitFor(() =>
            expect(window.location.pathname).toBe('/trail/traces/r4'),
        )
        expect(search().get('from')).toBe(here(conversationId, 'r4'))
    })

    it('has no previous step at the first turn and no next step at the last', async () => {
        conversationServer(turnsOf(3))

        await open(`/traces/r1${fromQuery(here(conversationId, 'r1'))}`)
        await settled(next, false)

        expect(previous()).toHaveAttribute('aria-disabled', 'true')
        expect(next().tagName).toBe('A')
    })

    it('has no next step at the last turn', async () => {
        conversationServer(turnsOf(3))

        await open(`/traces/r3${fromQuery(here(conversationId, 'r3'))}`)
        await settled(previous, false)

        expect(next()).toHaveAttribute('aria-disabled', 'true')
        expect(previous().tagName).toBe('A')
    })

    it('says a conversation of one turn has no other', async () => {
        conversationServer(turnsOf(1))

        await open(`/traces/r1${fromQuery(here(conversationId, 'r1'))}`)

        expect(
            await within(stepper()).findByText(
                'No other turn before or after this one in the conversation.',
            ),
        ).toBeVisible()
        expect(previous()).toHaveAttribute('aria-disabled', 'true')
        expect(next()).toHaveAttribute('aria-disabled', 'true')
    })

    it('says so when the neighbours could not be loaded, and still leads back', async () => {
        conversationServer(turnsOf(3)).failNeighbours = true
        await open(`/traces/r2${fromQuery(here(conversationId, 'r2'))}`)

        expect(
            await within(stepper()).findByText(
                'Previous and next turn could not be loaded.',
            ),
        ).toBeVisible()
        expect(backLinks()).toHaveLength(2)
    })
})

describe('a run opened from the list of runs', () => {
    it('is labelled for runs and asks the list view, as before', async () => {
        const server = conversationServer(turnsOf(3))

        await open(`/traces/r2${fromQuery('/traces?range=7d&status=failed')}`)
        await act(async () => {
            await new Promise((done) => setTimeout(done, 20))
        })

        expect(
            screen.getAllByRole('link', { name: 'Back to traces' }),
        ).toHaveLength(2)
        expect(
            screen.getByRole('group', { name: 'Step through the list' }),
        ).toBeVisible()
        expect(screen.getByLabelText('Previous trace')).toBeVisible()
        expect(server.neighbours()).toEqual([
            'r2?range=7d&sort=-started_at&status=failed',
        ])
    })
})

describe('the conversation of a run', () => {
    const header = () =>
        within(
            document.querySelector('[data-slot="trace-header"]') as HTMLElement,
        )

    it('is a link in the header to the conversation at that run’s turn, however the run was opened', async () => {
        conversationServer(turnsOf(3))

        await open('/traces/r2')

        expect(
            header().getByRole('link', { name: conversationId }),
        ).toHaveAttribute(
            'href',
            '/trail/conversations/transcript?id=support%2Fada+1042&turn=r2',
        )
    })

    it('is the same link for a run opened from the list or from the conversation', async () => {
        conversationServer(turnsOf(3))

        await open(`/traces/r2${fromQuery('/traces?range=7d')}`)

        expect(
            header().getByRole('link', { name: conversationId }),
        ).toHaveAttribute(
            'href',
            '/trail/conversations/transcript?id=support%2Fada+1042&turn=r2',
        )
    })

    it('encodes an awkward id and an awkward run id', async () => {
        const awkward = 'ü/日本語 x?#&=%+'
        const run = turnOf('r/2 é', { trace: { conversation_id: awkward } })
        conversationServer([run])

        await open(`/traces/${encodeURIComponent('r/2 é')}`)

        const target = link(header().getByRole('link', { name: awkward }))

        expect(target.pathname).toBe('/trail/conversations/transcript')
        expect(target.searchParams.get('id')).toBe(awkward)
        expect(target.searchParams.get('turn')).toBe('r/2 é')
    })

    it('is not there for a run with no conversation', async () => {
        conversationServer([
            turnsOf(1)[0],
            turnOf('r2', { trace: { conversation_id: null } }),
        ])

        await open('/traces/r2')

        expect(header().queryByText('Conversation')).toBeNull()
        expect(
            document.querySelector('a[href*="/conversations/transcript"]'),
        ).toBeNull()
    })

    it('is a link in the metadata too', async () => {
        conversationServer(turnsOf(3))

        await open('/traces/r2')
        await userEvent.click(
            within(
                screen.getByRole('tablist', { name: 'Run views' }),
            ).getByRole('tab', { name: 'Metadata' }),
        )

        const row = (await screen.findByText('Conversation id')).closest(
            'div',
        ) as HTMLElement

        expect(
            within(row).getByRole('link', { name: conversationId }),
        ).toHaveAttribute(
            'href',
            '/trail/conversations/transcript?id=support%2Fada+1042&turn=r2',
        )
    })

    it('opens the conversation at the run’s turn', async () => {
        const server = conversationServer(turnsOf(25))

        await open('/traces/r12')
        await userEvent.click(
            header().getByRole('link', { name: conversationId }),
        )
        await screen.findByRole('article', { name: 'Turn 12' })

        expect(Object.fromEntries(server.transcript().at(-1) ?? [])).toEqual({
            id: conversationId,
            turn: 'r12',
        })
        await waitFor(() =>
            expect(
                screen.getByRole('heading', { name: 'Turn 12' }),
            ).toHaveFocus(),
        )
    })
})
