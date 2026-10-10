import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { conversationKeys } from '@/api/conversations'
import { markedFor } from '@/features/conversations/use-turn-arrival'
import { conversationPath } from '@/lib/conversation-path'
import { conversationId, conversationServer } from '@/test/conversation-server'
import { renderApp, testQueryClient } from '@/test/render-app'
import { travel } from '@/test/traces-api'
import { call, message, turnOf, windowOf } from '@/test/transcript-api'

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

/** Conversation turns `r1` … `rN`, oldest first. */
const turnsOf = (count: number) =>
    Array.from({ length: count }, (_, index) => turnOf(`r${index + 1}`))

const route = (extra = '', id = conversationId) =>
    `${conversationPath(id)}${extra}`

const article = (number: number) =>
    screen.getByRole('article', { name: `Turn ${number}` })
const heading = (number: number) =>
    screen.getByRole('heading', { name: `Turn ${number}` })
const numbers = () =>
    screen
        .getAllByRole('article')
        .map((item) =>
            Number(item.querySelector('h2 .sr-only')?.textContent?.slice(5)),
        )
const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, index) => from + index)
const search = () => new URLSearchParams(window.location.search)
const queries = (server: ReturnType<typeof conversationServer>) =>
    server.transcript().map((params) => Object.fromEntries(params))

async function open(path: string, client = testQueryClient()) {
    const view = renderApp(path, {}, client)

    await screen.findAllByRole('article', { name: /^Turn / })

    return { view, client }
}

describe('arriving at a turn', () => {
    it('loads the window ending at the turn, numbers it from the database’s count and says what lies after', async () => {
        const server = conversationServer(turnsOf(25))

        await open(route('&turn=r15'))

        expect(queries(server)).toEqual([{ id: conversationId, turn: 'r15' }])
        expect(numbers()).toEqual(range(6, 15))
        expect(
            screen.getByRole('button', { name: 'Show earlier turns (5)' }),
        ).toBeVisible()
        expect(
            screen.getByRole('button', { name: 'Show later turns (10)' }),
        ).toBeVisible()
    })

    it('scrolls the turn into view, moves focus to its heading and marks it', async () => {
        const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')

        conversationServer(turnsOf(25))
        await open(route('&turn=r15'))

        await waitFor(() => expect(heading(15)).toHaveFocus())
        expect(
            scroll.mock.contexts.map((element) => (element as Element).id),
        ).toContain('turn-r15')
        expect(article(15)).toHaveAttribute('data-marked', 'true')
        expect(article(14)).not.toHaveAttribute('data-marked')
    })

    it('marks with a colour from the theme that appears and fades only where motion is welcome', async () => {
        conversationServer(turnsOf(25))
        await open(route('&turn=r15'))
        await waitFor(() => expect(article(15)).toHaveAttribute('data-marked'))

        const classes = article(15).className.split(/\s+/)

        expect(classes).toContain('bg-accent')
        // No transition or animation outside `motion-safe:`.
        expect(
            classes.filter((name) =>
                /^(transition|animate|duration)/.test(name),
            ),
        ).toEqual([])
        expect(classes).toContain('motion-safe:transition-colors')
    })

    it('takes the mark away after a moment and leaves focus where it was put', async () => {
        conversationServer(turnsOf(25))
        await open(route('&turn=r15'))
        await waitFor(() => expect(article(15)).toHaveAttribute('data-marked'))

        await waitFor(
            () => expect(article(15)).not.toHaveAttribute('data-marked'),
            { timeout: markedFor + 1_500 },
        )
        expect(heading(15)).toHaveFocus()
    }, 8_000)

    it('moves nothing without a turn in the address', async () => {
        const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')

        conversationServer(turnsOf(25))
        await open(route())
        await act(async () => {
            await new Promise((done) => setTimeout(done, 20))
        })

        expect(scroll).not.toHaveBeenCalled()
        expect(document.querySelector('[data-marked]')).toBeNull()
        expect(numbers()).toEqual(range(16, 25))
        expect(
            screen.queryByRole('button', { name: /^Show later turns/ }),
        ).toBeNull()
    })

    it('puts the turn at the end of the first window, so a turn near the start shows from turn 1', async () => {
        conversationServer(turnsOf(25))
        await open(route('&turn=r3'))

        expect(numbers()).toEqual([1, 2, 3])
        expect(
            screen.queryByRole('button', { name: /^Show earlier turns/ }),
        ).toBeNull()
        expect(
            screen.getByRole('button', { name: 'Show later turns (22)' }),
        ).toBeVisible()
    })
})

describe('restoring the place', () => {
    it('does it again on a reload, from the cache or not', async () => {
        const server = conversationServer(turnsOf(25))
        const { view, client } = await open(route('&turn=r15'))

        await waitFor(() => expect(heading(15)).toHaveFocus())
        view.unmount()
        expect(document.body).toHaveFocus()

        // Cached: the page is there on its first render, before the shell has done its own move.
        const again = renderApp(route('&turn=r15'), {}, client)
        await screen.findByRole('article', { name: 'Turn 15' })
        await waitFor(() => expect(heading(15)).toHaveFocus())
        expect(article(15)).toHaveAttribute('data-marked', 'true')
        expect(server.transcript()).toHaveLength(1)
        again.unmount()

        // Not cached: as a fresh load of the address.
        renderApp(route('&turn=r15'))
        await screen.findByRole('article', { name: 'Turn 15' })
        await waitFor(() => expect(heading(15)).toHaveFocus())
        expect(server.transcript()).toHaveLength(2)
    })

    it('does it again on Back from a turn’s trace, and on Forward and Back again', async () => {
        conversationServer(turnsOf(25))
        await open(route('&turn=r15'))
        await waitFor(() => expect(heading(15)).toHaveFocus())

        await userEvent.click(
            screen.getByRole('link', { name: 'Inspect trace of turn 15' }),
        )
        await screen.findByRole('tree', { name: 'Execution tree' })
        expect(search().get('from')).toBe(
            `/conversations/transcript?id=support%2Fada+1042&turn=r15`,
        )

        await travel('back')
        await screen.findByRole('article', { name: 'Turn 15' })
        await waitFor(() => expect(heading(15)).toHaveFocus())
        expect(article(15)).toHaveAttribute('data-marked', 'true')

        await travel('forward')
        await screen.findByRole('tree', { name: 'Execution tree' })

        await travel('back')
        await screen.findByRole('article', { name: 'Turn 15' })
        await waitFor(() => expect(heading(15)).toHaveFocus())
    })

    it('does it for the turn a run’s "Back to conversation" leads to', async () => {
        conversationServer(turnsOf(25))
        await open(route('&turn=r15'))
        await userEvent.click(
            screen.getByRole('link', { name: 'Inspect trace of turn 12' }),
        )
        await screen.findByRole('tree', { name: 'Execution tree' })

        await userEvent.click(
            screen.getAllByRole('link', { name: 'Back to conversation' })[0],
        )
        await screen.findByRole('article', { name: 'Turn 12' })

        await waitFor(() => expect(heading(12)).toHaveFocus())
        expect(article(12)).toHaveAttribute('data-marked', 'true')
    })

    it('loads the window ending at a turn the loaded turns do not hold when the address moves there', async () => {
        const server = conversationServer(turnsOf(25))

        await open(route('&turn=r3'))
        expect(numbers()).toEqual([1, 2, 3])

        // Back or Forward to an entry of the same page at another place in the conversation.
        window.history.pushState({}, '', `/trail${route('&turn=r20')}`)
        act(() => {
            window.dispatchEvent(new PopStateEvent('popstate'))
        })

        await screen.findByRole('article', { name: 'Turn 20' })
        await waitFor(() => expect(heading(20)).toHaveFocus())
        expect(queries(server).at(-1)).toEqual({
            id: conversationId,
            turn: 'r20',
        })
        expect(numbers()).toEqual(range(11, 20))
    })

    it('moves to a loaded turn the address moves to, without loading anything', async () => {
        const server = conversationServer(turnsOf(25))

        await open(route('&turn=r15'))
        await waitFor(() => expect(heading(15)).toHaveFocus())

        window.history.pushState({}, '', `/trail${route('&turn=r9')}`)
        act(() => {
            window.dispatchEvent(new PopStateEvent('popstate'))
        })

        await waitFor(() => expect(heading(9)).toHaveFocus())
        expect(article(9)).toHaveAttribute('data-marked', 'true')
        expect(server.transcript()).toHaveLength(1)
    })
})

describe('later turns', () => {
    const later = () =>
        screen.getByRole('button', { name: /^(Show later turns|Try again)/ })

    it('appends the next window in order, keeps the numbers and moves focus to the first turn added', async () => {
        const server = conversationServer(turnsOf(25))

        await open(route('&turn=r5'))
        expect(later()).toHaveTextContent('Show later turns (20)')

        await userEvent.click(later())
        await screen.findByRole('article', { name: 'Turn 15' })

        expect(queries(server).at(-1)).toEqual({
            id: conversationId,
            after: 'r5',
        })
        expect(numbers()).toEqual(range(1, 15))
        // The database counts what is left: 25 turns, 15 loaded.
        expect(later()).toHaveTextContent('Show later turns (10)')
        await waitFor(() => expect(heading(6)).toHaveFocus())
    })

    it('takes the button away when the last window is in, and numbers it right', async () => {
        const server = conversationServer(turnsOf(12))

        await open(route('&turn=r5'))
        await userEvent.click(later())
        await screen.findByRole('article', { name: 'Turn 12' })

        expect(numbers()).toEqual(range(1, 12))
        expect(
            screen.queryByRole('button', { name: /^Show later turns/ }),
        ).toBeNull()
        expect(server.transcript()).toHaveLength(2)
        await waitFor(() => expect(heading(6)).toHaveFocus())
    })

    it('numbers earlier and later windows loaded around the first one', async () => {
        conversationServer(turnsOf(30))

        await open(route('&turn=r15'))
        await userEvent.click(later())
        await screen.findByRole('article', { name: 'Turn 25' })
        await userEvent.click(
            screen.getByRole('button', { name: /^Show earlier turns/ }),
        )
        await screen.findByRole('article', { name: 'Turn 1' })

        expect(numbers()).toEqual(range(1, 25))
        expect(
            screen.getByRole('button', { name: 'Show later turns (5)' }),
        ).toBeVisible()
    })

    it('says inline when later turns could not be loaded, keeps what is shown, and retries', async () => {
        const server = conversationServer(turnsOf(25))
        let broken = true

        server.intercept = (_url, params) =>
            broken && params.has('after')
                ? Promise.resolve(
                      new Response(
                          JSON.stringify({ message: 'Database unavailable.' }),
                          {
                              status: 500,
                          },
                      ),
                  )
                : undefined
        await open(route('&turn=r5'))
        await userEvent.click(later())

        const alert = await screen.findByRole('alert')

        expect(alert).toHaveTextContent('Later turns could not be loaded')
        expect(alert).toHaveTextContent('Database unavailable.')
        expect(numbers()).toEqual(range(1, 5))

        broken = false
        await userEvent.click(
            screen.getByRole('button', { name: 'Try again (20 later turns)' }),
        )
        await screen.findByRole('article', { name: 'Turn 15' })

        expect(screen.queryByRole('alert')).toBeNull()
        expect(numbers()).toEqual(range(1, 15))
    })

    it('offers nothing after the newest window', async () => {
        conversationServer(turnsOf(25))
        await open(route())

        expect(screen.queryByText(/Show later turns/)).toBeNull()
    })
})

describe('a link to a turn', () => {
    function stubClipboard() {
        const writeText = vi.fn(() => Promise.resolve())

        vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })

        return writeText
    }

    const press = (name: string) =>
        act(async () => {
            // Not user-event: it installs a clipboard of its own, hiding the stub under test.
            fireEvent.click(screen.getByRole('button', { name }))
            await Promise.resolve()
        })

    it('copies the conversation’s address with the turn’s run id', async () => {
        conversationServer(turnsOf(3))
        const writeText = stubClipboard()

        await open(route())
        await press('Copy link to turn 2')

        expect(writeText).toHaveBeenCalledWith(
            `${window.location.origin}/trail/conversations/transcript?id=support%2Fada+1042&turn=r2`,
        )
    })

    it('keeps the "Show tools" switch in the copied address, and leaves out what is transient', async () => {
        conversationServer(turnsOf(3))
        const writeText = stubClipboard()

        // The address names turn 3; the link of turn 2 is turn 2's own.
        await open(route('&tools=0&turn=r3'))
        await press('Copy link to turn 2')

        expect(writeText).toHaveBeenCalledWith(
            `${window.location.origin}/trail/conversations/transcript?id=support%2Fada+1042&tools=0&turn=r2`,
        )
    })

    it('copies the id the response returns, in its own spelling', async () => {
        conversationServer(turnsOf(2))
        const writeText = stubClipboard()

        // The address spells the id another way than the database does.
        await open(route('', 'SUPPORT/ADA 1042'))
        await press('Copy link to turn 1')

        expect(writeText).toHaveBeenCalledWith(
            `${window.location.origin}/trail/conversations/transcript?id=support%2Fada+1042&turn=r1`,
        )
    })
})

describe('the side list', () => {
    it('writes the turn to the address by replacing the entry and marks the turn', async () => {
        conversationServer(turnsOf(25))
        await open(route())

        const replace = vi.spyOn(window.history, 'replaceState')
        const push = vi.spyOn(window.history, 'pushState')
        const entries = window.history.length

        await userEvent.click(
            within(
                screen.getByRole('navigation', { name: 'Jump to turn' }),
            ).getAllByRole('link')[3],
        )

        await waitFor(() => expect(search().get('turn')).toBe('r19'))
        expect(heading(19)).toHaveFocus()
        expect(article(19)).toHaveAttribute('data-marked', 'true')
        expect(replace).toHaveBeenCalled()
        expect(push).not.toHaveBeenCalled()
        expect(window.history.length).toBe(entries)
    })

    it('does not scroll a second time when the address it wrote comes back to the page', async () => {
        const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')

        conversationServer(turnsOf(25))
        await open(route())
        await userEvent.click(
            within(
                screen.getByRole('navigation', { name: 'Jump to turn' }),
            ).getAllByRole('link')[3],
        )
        await waitFor(() => expect(search().get('turn')).toBe('r19'))
        await act(async () => {
            await new Promise((done) => setTimeout(done, 20))
        })

        expect(
            scroll.mock.contexts.filter(
                (element) => (element as Element).id === 'turn-r19',
            ),
        ).toHaveLength(1)
    })
})

describe('a turn that is gone', () => {
    it('shows the newest turns with a note above them, never an error', async () => {
        const server = conversationServer(turnsOf(25))

        await open(route('&turn=ghost'))

        expect(queries(server)).toEqual([{ id: conversationId, turn: 'ghost' }])
        expect(numbers()).toEqual(range(16, 25))

        const note = screen.getByRole('status')

        expect(note).toHaveTextContent('That turn is no longer recorded.')
        // Above the transcript's own line.
        expect(
            note.compareDocumentPosition(
                screen.getByText('25 recorded turns'),
            ) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy()
        expect(screen.queryByRole('alert')).toBeNull()
        expect(document.querySelector('[data-marked]')).toBeNull()
    })

    it('drops the turn from the address, replacing the entry, when the note is dismissed, and keeps focus on the page', async () => {
        conversationServer(turnsOf(25))
        await open(route('&turn=ghost'))

        const entries = window.history.length
        const push = vi.spyOn(window.history, 'pushState')

        await userEvent.click(
            screen.getByRole('button', { name: 'Dismiss this note' }),
        )

        await waitFor(() => expect(search().has('turn')).toBe(false))
        expect(search().get('id')).toBe(conversationId)
        expect(
            screen.queryByText('That turn is no longer recorded.'),
        ).toBeNull()
        expect(push).not.toHaveBeenCalled()
        expect(window.history.length).toBe(entries)
        expect(numbers()).toEqual(range(16, 25))
        await waitFor(() =>
            expect(
                screen.getByRole('heading', { level: 1, name: 'Conversation' }),
            ).toHaveFocus(),
        )
    })

    it('says nothing about a turn that is there', async () => {
        conversationServer(turnsOf(25))
        await open(route('&turn=r20'))

        expect(screen.queryByText(/no longer recorded/)).toBeNull()
    })

    it('leaves the note when the reader goes to another turn', async () => {
        conversationServer(turnsOf(25))
        await open(route('&turn=ghost'))

        await userEvent.click(
            within(
                screen.getByRole('navigation', { name: 'Jump to turn' }),
            ).getAllByRole('link')[0],
        )

        await waitFor(() =>
            expect(
                screen.queryByText('That turn is no longer recorded.'),
            ).toBeNull(),
        )
    })
})

describe('the links of a turn', () => {
    it('carry the conversation at that turn as the way back, with the awkward id as it is', async () => {
        const awkward = 'ü/日本語 x?#&=%+'
        conversationServer(turnsOf(3), awkward)
        await open(route('', awkward))

        for (const [number, id] of [
            [1, 'r1'],
            [3, 'r3'],
        ] as const) {
            const link = within(article(number)).getByRole('link', {
                name: /Inspect trace/,
            })
            const from = new URL(
                link.getAttribute('href') ?? '',
                'http://x',
            ).searchParams.get('from')

            expect(from).toBe(
                `/conversations/transcript?${new URLSearchParams({ id: awkward, turn: id })}`,
            )
        }
    })

    it('keep "Show tools" off in the way back', async () => {
        conversationServer(turnsOf(3))
        await open(route('&tools=0'))

        const link = within(article(2)).getByRole('link', {
            name: /Inspect trace/,
        })

        expect(
            new URL(
                link.getAttribute('href') ?? '',
                'http://x',
            ).searchParams.get('from'),
        ).toBe(
            '/conversations/transcript?id=support%2Fada+1042&tools=0&turn=r2',
        )
    })

    it('never keep a turn that is not their own', async () => {
        conversationServer(turnsOf(25))
        await open(route('&turn=r15'))

        const link = within(article(12)).getByRole('link', {
            name: /Inspect trace/,
        })

        expect(
            new URL(
                link.getAttribute('href') ?? '',
                'http://x',
            ).searchParams.get('from'),
        ).toBe('/conversations/transcript?id=support%2Fada+1042&turn=r12')
    })
})

describe('the way to the conversation’s runs', () => {
    it('is a link in the header to Traces filtered to the conversation', async () => {
        conversationServer(turnsOf(3))
        await open(route())

        const link = screen.getByRole('link', {
            name: 'View these runs in Traces',
        })

        expect(link).toHaveAttribute(
            'href',
            '/trail/traces?conversation=support%2Fada+1042',
        )
        // It sets no time range, and says the list applies its own.
        expect(link.getAttribute('href')).not.toContain('range')
        expect(link.getAttribute('title')).toMatch(/time range/)
        // Keyboard and touch readers get it too: it is the link's description, not only a tooltip.
        expect(link).toHaveAccessibleDescription(/within the time range/)
    })

    it('does not say the list holds all of the conversation’s runs', async () => {
        conversationServer(turnsOf(3))
        await open(route())

        const link = screen.getByRole('link', {
            name: 'View these runs in Traces',
        })

        expect(`${link.textContent} ${link.getAttribute('title')}`).not.toMatch(
            /\ball\b/i,
        )
    })
})

describe('coming back from a turn’s link', () => {
    it('returns to the turn the reader left, not the one the address named, and stays one entry', async () => {
        conversationServer(turnsOf(25))
        await open(route('&turn=r15'))
        await waitFor(() => expect(heading(15)).toHaveFocus())

        const push = vi.spyOn(window.history, 'pushState')
        const replace = vi.spyOn(window.history, 'replaceState')

        await userEvent.click(
            screen.getByRole('link', { name: 'Inspect trace of turn 12' }),
        )
        await screen.findByRole('tree', { name: 'Execution tree' })

        // The conversation's entry was rewritten to turn 12; the run's page is the one new entry.
        expect(push).toHaveBeenCalledTimes(1)
        expect(replace).toHaveBeenCalled()

        await travel('back')
        await screen.findByRole('article', { name: 'Turn 12' })

        expect(search().get('turn')).toBe('r12')
        await waitFor(() => expect(heading(12)).toHaveFocus())
        expect(article(12)).toHaveAttribute('data-marked', 'true')
    })

    it('does the same from a tool chip', async () => {
        const turns = turnsOf(25)

        turns[11] = turnOf('r12', {
            messages: [
                message('prompt', 'Question of r12'),
                message('activity', null, {
                    tool_calls: [call('lookup', { id: 'r12-lookup' })],
                }),
            ],
        })
        conversationServer(turns)
        await open(route('&turn=r15'))
        await waitFor(() => expect(heading(15)).toHaveFocus())
        await userEvent.click(
            within(article(12)).getByRole('link', { name: /lookup/ }),
        )
        await screen.findByRole('tree', { name: 'Execution tree' })
        await travel('back')
        await screen.findByRole('article', { name: 'Turn 12' })

        expect(search().get('turn')).toBe('r12')
        await waitFor(() => expect(heading(12)).toHaveFocus())
    })

    it('moves nothing on the page it is leaving', async () => {
        const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')

        conversationServer(turnsOf(25))
        await open(route('&turn=r15'))
        await waitFor(() => expect(heading(15)).toHaveFocus())
        scroll.mockClear()
        await userEvent.click(
            screen.getByRole('link', { name: 'Inspect trace of turn 12' }),
        )
        await screen.findByRole('tree', { name: 'Execution tree' })

        expect(
            scroll.mock.contexts.filter(
                (element) => (element as Element).id === 'turn-r12',
            ),
        ).toHaveLength(0)
    })
})

describe('a turn the address names that no run can have', () => {
    it('shows the newest turns with the note, and never asks the API with it', async () => {
        const server = conversationServer(turnsOf(25))
        const long = 'x'.repeat(70)

        await open(route(`&turn=${long}`))

        expect(queries(server)).toEqual([{ id: conversationId }])
        expect(numbers()).toEqual(range(16, 25))
        expect(screen.getByRole('status')).toHaveTextContent(
            'That turn is no longer recorded.',
        )
        expect(screen.queryByRole('alert')).toBeNull()
    })
})

describe('more turns next to a turn that is gone', () => {
    it('says so instead of looking like a dead button, and keeps the turns', async () => {
        const server = conversationServer(turnsOf(25))

        await open(route('&turn=r15'))
        // The turn the earlier window follows is pruned while the page is open.
        server.intercept = (_url, params) =>
            params.has('before')
                ? Promise.resolve(
                      new Response(
                          JSON.stringify({
                              ...windowOf(turnsOf(25).slice(15), {
                                  older: 15,
                                  newer: 0,
                              }),
                              window: {
                                  older: 15,
                                  newer: 0,
                                  anchor: {
                                      param: 'before',
                                      id: 'r6',
                                      found: false,
                                  },
                              },
                          }),
                          { status: 200 },
                      ),
                  )
                : undefined
        await userEvent.click(
            screen.getByRole('button', { name: /^Show earlier turns/ }),
        )

        const alert = await screen.findByRole('alert')

        expect(alert).toHaveTextContent('Earlier turns could not be loaded')
        expect(numbers()).toEqual(range(6, 15))
        expect(screen.getByRole('button', { name: /^Try again/ })).toBeVisible()
    })
})

describe('the count of later turns', () => {
    it('follows a refresh while the newest turns are not loaded', async () => {
        const server = conversationServer(turnsOf(25))

        await open(route('&turn=r5'))
        expect(
            screen.getByRole('button', { name: 'Show later turns (20)' }),
        ).toBeVisible()

        server.turns = turnsOf(26)
        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

        expect(
            await screen.findByRole('button', {
                name: 'Show later turns (21)',
            }),
        ).toBeVisible()
        expect(screen.getByText('26 recorded turns')).toBeVisible()
    })
})

describe('the cache', () => {
    it('keeps a window per address a page was opened on', async () => {
        conversationServer(turnsOf(25))

        const { client } = await open(route('&turn=r15'))

        expect(
            client.getQueryData(
                conversationKeys.transcript(conversationId, 'r15'),
            ),
        ).toBeDefined()
        expect(
            client.getQueryData(
                conversationKeys.transcript(conversationId, ''),
            ),
        ).toBeUndefined()
    })
})
