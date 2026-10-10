import { within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appReady, renderApp } from '@/test/render-app'
import { stubResizeObserver } from '@/test/resize-observer'
import { until } from '@/test/wait'
import {
    advance,
    agentWith,
    chord,
    clock,
    deferred,
    fixtureAgent,
    fixtureConversation,
    json,
    mockSearch,
    optionNames,
    palette,
    runWith,
    searched,
    searchFixture,
    searchFor,
    searchRow,
    status,
    type Handler,
} from '@/test/palette-api'

beforeEach(() => {
    stubResizeObserver()
    vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
})

/** Opens the palette on `route` and types `text`; the search has not been made yet. */
async function typeInto(route: string, text: string) {
    const user = clock()
    renderApp(route)
    await appReady()
    await user.keyboard(chord)
    await user.type(searchRow(), text)

    return user
}

const group = (name: string) => within(palette()).getByRole('group', { name })
const options = (name: string) => within(group(name)).getAllByRole('option')
const hrefOf = (option: HTMLElement) =>
    within(option).getByRole('link').getAttribute('href')

describe('what a search shows', () => {
    it('asks for the text and the default range, once the typing has paused', async () => {
        const fetchMock = mockSearch(() => json(searchFixture))
        await typeInto('/', 'order')

        expect(fetchMock.searches()).toHaveLength(0)

        await advance(300)
        await until(() => expect(fetchMock.searches()).toHaveLength(1))

        expect(fetchMock.searches()[0]?.[0]).toBe(
            '/trail/api/search?q=order&range=24h',
        )
    })

    it('shows the runs, the conversation and the agent of the answer, each as a link', async () => {
        mockSearch(() => json(searchFixture))
        await typeInto('/', 'order')
        await advance(300)
        await until(() => expect(group('Runs')).toBeInTheDocument())

        const [first, second] = options('Runs')

        expect(options('Runs')).toHaveLength(2)
        expect(hrefOf(first)).toBe('/trail/traces/turn-p1')
        expect(first).toHaveTextContent('SupportAssistant')
        expect(first).toHaveTextContent('Where is my order?')
        expect(first).toHaveTextContent('Completed')
        expect(first).toHaveTextContent('turn-p1')
        expect(first?.querySelector('time')).toHaveAttribute(
            'datetime',
            '2026-01-02T11:00:00.000Z',
        )
        expect(hrefOf(second)).toBe('/trail/traces/run-order')
        expect(second).toHaveTextContent('OrderAgent')

        const [conversation] = options('Conversations')

        expect(options('Conversations')).toHaveLength(1)
        expect(hrefOf(conversation)).toBe(
            '/trail/conversations/transcript?id=order',
        )
        expect(conversation).toHaveTextContent('order')
        expect(conversation).toHaveTextContent('1 turn')
        expect(conversation?.querySelector('time')).toHaveAttribute(
            'datetime',
            '2026-01-02T09:00:00.000Z',
        )

        const [agent] = options('Agents')

        expect(options('Agents')).toHaveLength(1)
        expect(hrefOf(agent)).toBe('/trail/agents/agent?name=OrderAgent')
        expect(agent).toHaveTextContent('OrderAgent')
        expect(agent).toHaveTextContent('1 run')
    })

    it('puts the results under the pages', async () => {
        mockSearch(() => json(searchFixture))
        await typeInto('/', 'ag')
        await advance(300)
        await until(() => expect(group('Runs')).toBeInTheDocument())

        const headings = within(palette())
            .getAllByRole('group')
            .map((g) => g.getAttribute('aria-labelledby'))
            .filter((id) => id !== null)
            .map((id) => document.getElementById(id)?.textContent)

        expect(headings).toEqual([
            'Pages',
            'Actions',
            'Runs',
            'Conversations',
            'Agents',
        ])
    })

    it('leaves out a group that found nothing', async () => {
        mockSearch(() => json(searchFor('order', { agents: [fixtureAgent] })))
        await typeInto('/', 'order')
        await advance(300)
        await until(() => expect(group('Agents')).toBeInTheDocument())

        expect(
            within(palette()).queryByRole('group', { name: 'Runs' }),
        ).not.toBeInTheDocument()
        expect(
            within(palette()).queryByRole('group', { name: 'Conversations' }),
        ).not.toBeInTheDocument()
    })

    it('says an agent that was only delegated to has no runs of its own, and a run without a prompt has none stored', async () => {
        mockSearch(() =>
            json(
                searchFor('sub', {
                    traces: [
                        runWith({ id: 'run-quiet', prompt_excerpt: null }),
                    ],
                    agents: [
                        agentWith({
                            name: 'SubOnly',
                            top_level: null,
                        }),
                    ],
                }),
            ),
        )
        await typeInto('/', 'sub')
        await advance(300)
        await until(() => expect(group('Agents')).toBeInTheDocument())

        expect(options('Agents')[0]).toHaveTextContent('SubOnly')
        expect(options('Agents')[0]).toHaveTextContent('Sub-agent only')
        expect(options('Agents')[0]).not.toHaveTextContent('0 runs')
        expect(options('Runs')[0]).toHaveTextContent('No prompt stored')
    })

    it('shows an unnamed agent as one, and a failed run as failed', async () => {
        mockSearch(() =>
            json(
                searchFor('xx', {
                    traces: [runWith({ status: 'failed', id: 'run-bad' })],
                    agents: [agentWith({ name: '  ' })],
                }),
            ),
        )
        await typeInto('/', 'xx')
        await advance(300)
        await until(() => expect(group('Runs')).toBeInTheDocument())

        expect(options('Runs')[0]).toHaveTextContent('Failed')
        expect(options('Agents')[0]).toHaveTextContent('Unnamed agent')
    })

    it('keeps the id of a conversation as it is, whole', async () => {
        const id = 'a/very long conversation id chosen by the application'
        mockSearch(() =>
            json(
                searchFor(id.slice(0, 10), {
                    conversations: [{ ...fixtureConversation, id }],
                }),
            ),
        )
        await typeInto('/', id.slice(0, 10))
        await advance(300)
        await until(() => expect(group('Conversations')).toBeInTheDocument())

        expect(options('Conversations')[0]).toHaveTextContent(id)
        expect(hrefOf(options('Conversations')[0])).toBe(
            `/trail/conversations/transcript?id=${encodeURIComponent(id).replace(/%20/g, '+')}`,
        )
    })
})

describe('the range', () => {
    it.each([
        ['/traces?range=7d', '7d'],
        ['/usage?range=1h', '1h'],
        ['/agents', '24h'],
        ['/traces/some-run', '24h'],
    ])(
        'sends the range of the page it is opened on: %s',
        async (route, range) => {
            const fetchMock = mockSearch(() => json(searchFor('ab')))
            await typeInto(route, 'ab')
            await advance(300)
            await until(() => expect(fetchMock.searches()).toHaveLength(1))

            expect(fetchMock.searches()[0]?.[0]).toBe(
                `/trail/api/search?q=ab&range=${range}`,
            )
        },
    )

    it('says in one line what was searched, from the range the answer carries', async () => {
        // The page's range is the default, the answer says an hour: the line follows the answer.
        mockSearch(() => json(searchFor('ab', { preset: '1h' })))
        await typeInto('/', 'ab')

        expect(
            within(palette()).queryByText(/^Text matches from/),
        ).not.toBeInTheDocument()

        await advance(300)

        expect(
            await within(palette()).findByText(
                'Text matches from the last hour. An id finds a run from any time.',
            ),
        ).toBeInTheDocument()
    })

    it('names the other ranges the same way', async () => {
        mockSearch(() => json(searchFor('ab', { preset: '7d' })))
        await typeInto('/traces?range=7d', 'ab')
        await advance(300)

        expect(
            await within(palette()).findByText(
                'Text matches from the last 7 days. An id finds a run from any time.',
            ),
        ).toBeInTheDocument()
    })

    it('does not claim a range when the answer has none of the presets', async () => {
        mockSearch(() => json(searchFor('ab', { preset: null })))
        await typeInto('/', 'ab')
        await advance(300)

        expect(
            await within(palette()).findByText(
                'Text matches from the period searched. An id finds a run from any time.',
            ),
        ).toBeInTheDocument()
    })

    it('carries the agent’s link in the range of the page', async () => {
        mockSearch(() => json(searchFor('or', { agents: [fixtureAgent] })))
        await typeInto('/traces?range=7d', 'or')
        await advance(300)
        await until(() => expect(group('Agents')).toBeInTheDocument())

        expect(hrefOf(options('Agents')[0])).toBe(
            '/trail/agents/agent?name=OrderAgent&range=7d',
        )
    })
})

describe('a group that was cut', () => {
    const cut = () =>
        json(
            searchFor('abc', {
                traces: [runWith({ id: 'r1' })],
                agents: [agentWith({ name: 'A1' })],
                truncated: { traces: true, agents: true },
            }),
        )

    it('ends with the list that holds the rest, with this search and the default range', async () => {
        mockSearch(cut)
        await typeInto('/', 'abc')
        await advance(300)
        await until(() => expect(group('Runs')).toBeInTheDocument())

        const runs = options('Runs')
        const agents = options('Agents')

        expect(runs).toHaveLength(2)
        expect(runs.at(-1)).toHaveTextContent('Show all matching runs')
        expect(hrefOf(runs.at(-1)!)).toBe('/trail/traces?search=abc')
        expect(agents).toHaveLength(2)
        expect(agents.at(-1)).toHaveTextContent('Show all matching agents')
        expect(hrefOf(agents.at(-1)!)).toBe('/trail/agents?search=abc')
    })

    it('keeps the range of the page in both addresses', async () => {
        mockSearch(cut)
        await typeInto('/usage?range=7d', 'abc')
        await advance(300)
        await until(() => expect(group('Runs')).toBeInTheDocument())

        expect(hrefOf(options('Runs').at(-1)!)).toBe(
            '/trail/traces?range=7d&search=abc',
        )
        expect(hrefOf(options('Agents').at(-1)!)).toBe(
            '/trail/agents?range=7d&search=abc',
        )
    })

    it('goes there on Enter', async () => {
        mockSearch(cut)
        const user = await typeInto('/', 'abc')
        await advance(300)
        await until(() => expect(group('Runs')).toBeInTheDocument())

        // Pages and actions come first: down to the last run option.
        const all = within(palette()).getAllByRole('option')
        const index = all.indexOf(options('Runs').at(-1)!)

        await user.keyboard('{ArrowDown}'.repeat(index))
        await user.keyboard('{Enter}')

        expect(window.location.pathname + window.location.search).toBe(
            '/trail/traces?search=abc',
        )
    })

    it('adds nothing to a group that was not cut', async () => {
        mockSearch(() =>
            json(searchFor('abc', { traces: [runWith({ id: 'r1' })] })),
        )
        await typeInto('/', 'abc')
        await advance(300)
        await until(() => expect(group('Runs')).toBeInTheDocument())

        expect(options('Runs')).toHaveLength(1)
        expect(
            within(palette()).queryByText('Show all matching runs'),
        ).not.toBeInTheDocument()
    })
})

describe('loading, nothing found and failure', () => {
    const phrases = {
        loading: 'Searching…',
        nothing: 'No runs, conversations or agents match “zzz”.',
        failed: 'The search could not be completed. The server answered with an error (500).',
    }

    it('says it is searching while the request is out, and not that nothing was found', async () => {
        const wait = deferred()
        mockSearch(() => wait.promise)
        await typeInto('/', 'zzz')

        // While the text is still in its pause.
        expect(status()).toHaveTextContent(phrases.loading)

        await advance(300)

        expect(status()).toHaveTextContent(phrases.loading)
        expect(
            within(palette()).queryByRole('button', { name: 'Try again' }),
        ).not.toBeInTheDocument()

        wait.resolve(await json(searchFor('zzz')))

        await until(() => expect(status()).toHaveTextContent(phrases.nothing))
    })

    it('says nothing matched, without a way to retry', async () => {
        mockSearch(() => json(searchFor('zzz')))
        await typeInto('/', 'zzz')
        await advance(300)
        await until(() => expect(status()).toHaveTextContent(phrases.nothing))

        expect(
            within(palette()).queryByRole('button', { name: 'Try again' }),
        ).not.toBeInTheDocument()
        // The pages that match nothing are gone too; no search group appeared.
        expect(optionNames()).toEqual([])
    })

    it('says the search failed, and tries again', async () => {
        let attempt = 0
        const fetchMock = mockSearch(() => {
            attempt += 1

            return attempt === 1
                ? json({ message: 'Boom' }, 500)
                : json(searchFor('zzz', { agents: [fixtureAgent] }))
        })
        const user = await typeInto('/', 'zzz')
        await advance(300)
        await until(() => expect(status()).toHaveTextContent(phrases.failed))

        expect(
            within(palette()).queryByRole('group', { name: 'Agents' }),
        ).not.toBeInTheDocument()

        await user.click(
            within(palette()).getByRole('button', { name: 'Try again' }),
        )
        await until(() => expect(group('Agents')).toBeInTheDocument())

        expect(fetchMock.searches()).toHaveLength(2)
        expect(
            within(palette()).queryByRole('button', { name: 'Try again' }),
        ).not.toBeInTheDocument()
    })

    it('says the server could not be reached when there was no answer', async () => {
        mockSearch(() => Promise.reject(new TypeError('Failed to fetch')))
        await typeInto('/', 'zzz')
        await advance(300)

        await until(() =>
            expect(status()).toHaveTextContent(
                'The search could not be completed. The server could not be reached. Check the connection and try again.',
            ),
        )
        expect(
            within(palette()).getByRole('button', { name: 'Try again' }),
        ).toBeInTheDocument()
    })
})

describe('what is announced', () => {
    it('is one status, outside any busy region, which says the count once for the search', async () => {
        mockSearch(() => json(searchFixture))
        const sentences: string[] = []
        const user = clock()
        renderApp('/')
        await appReady()
        await user.keyboard(chord)

        const line = status()
        const watch = new MutationObserver(() => {
            const text = line.textContent ?? ''

            if (text !== '' && sentences.at(-1) !== text) {
                sentences.push(text)
            }
        })
        watch.observe(line, {
            childList: true,
            characterData: true,
            subtree: true,
        })

        await user.type(searchRow(), 'order')
        await advance(300)
        await until(() => expect(group('Runs')).toBeInTheDocument())
        await advance(300)
        watch.disconnect()

        expect(within(palette()).getAllByRole('status')).toHaveLength(1)
        expect(line.closest('[aria-busy="true"]')).toBeNull()
        // Each sentence once, in order: one character is too few, then the request, then the count.
        expect(sentences).toEqual([
            'Type at least 2 characters to search runs, conversations and agents.',
            'Searching…',
            '4 results for “order”.',
        ])
        expect(line).toHaveTextContent('4 results for “order”.')
    })

    it('counts one result in the singular', async () => {
        mockSearch(() => json(searchFor('ab', { agents: [fixtureAgent] })))
        await typeInto('/', 'ab')
        await advance(300)
        await until(() =>
            expect(status()).toHaveTextContent('1 result for “ab”.'),
        )
    })
})

describe('the sentence when a group was cut', () => {
    const runs = (n: number) =>
        Array.from({ length: n }, (_, i) => runWith({ id: `r${i}` }))
    const agents = (n: number) =>
        Array.from({ length: n }, (_, i) => agentWith({ name: `A${i}` }))
    const said = async (answer: ReturnType<typeof searchFor>, text: string) => {
        mockSearch(() => json(answer))
        await typeInto('/', 'ab')
        await advance(300)
        await until(() => expect(status()).toHaveTextContent(text))
        expect(status().textContent).toBe(text)
    }

    it('states a total when nothing was cut', () =>
        said(
            searchFor('ab', { traces: runs(2), agents: agents(1) }),
            '3 results for “ab”.',
        ))

    it('says more runs match, without a total, when the runs were cut', () =>
        said(
            searchFor('ab', {
                traces: runs(5),
                agents: agents(3),
                truncated: { traces: true },
            }),
            'Showing 5 runs and 3 agents; more runs match.',
        ))

    it('says more agents match when the agents were cut', () =>
        said(
            searchFor('ab', {
                traces: runs(1),
                agents: agents(5),
                truncated: { agents: true },
            }),
            'Showing 1 run and 5 agents; more agents match.',
        ))

    it('names both when both were cut', () =>
        said(
            searchFor('ab', {
                traces: runs(5),
                agents: agents(5),
                truncated: { traces: true, agents: true },
            }),
            'Showing 5 runs and 5 agents; more runs and agents match.',
        ))

    it('lists the conversation among what is shown', () =>
        said(
            searchFor('ab', {
                traces: runs(5),
                conversations: [fixtureConversation],
                agents: agents(2),
                truncated: { traces: true },
            }),
            'Showing 5 runs, 1 conversation and 2 agents; more runs match.',
        ))
})

describe('a short text', () => {
    it('makes no request and shows the pages and actions only', async () => {
        const fetchMock = mockSearch(() => json(searchFixture))
        await typeInto('/', 'o')
        await advance(1000)

        expect(fetchMock.searches()).toHaveLength(0)
        expect(optionNames()).toEqual([
            'OverviewPage',
            'ConversationsPage',
            'Usage & costPage',
            'Toggle themeAction',
            'Copy link to this pageAction',
            'Keyboard shortcuts?Action',
        ])
        expect(
            within(palette()).queryByRole('group', { name: 'Runs' }),
        ).not.toBeInTheDocument()
    })

    it('does not ask for a text of spaces, or the text without its spaces', async () => {
        const fetchMock = mockSearch(() => json(searchFor('ab')))
        const user = await typeInto('/', '  a ')
        await advance(1000)

        expect(fetchMock.searches()).toHaveLength(0)

        await user.type(searchRow(), 'b ')
        await advance(300)
        await until(() => expect(fetchMock.searches()).toHaveLength(1))

        expect(searched(fetchMock.searches()[0][0])).toBe('a b')
    })

    it('goes quiet again when the text is cut below the minimum', async () => {
        const fetchMock = mockSearch(() =>
            json(searchFor('ab', { agents: [fixtureAgent] })),
        )
        const user = await typeInto('/', 'ab')
        await advance(300)
        await until(() => expect(group('Agents')).toBeInTheDocument())

        await user.type(searchRow(), '{Backspace}')
        await advance(1000)

        expect(
            within(palette()).queryByRole('group', { name: 'Agents' }),
        ).not.toBeInTheDocument()
        expect(fetchMock.searches()).toHaveLength(1)
    })
})

describe('never the answer to another text', () => {
    /** A search the test answers one request at a time. */
    function held() {
        const pending: {
            q: string
            signal: AbortSignal
            answer: ReturnType<typeof deferred>
        }[] = []
        const respond: Handler = (url, init) => {
            const answer = deferred()
            pending.push({
                q: searched(url) ?? '',
                signal: init?.signal as AbortSignal,
                answer,
            })

            return answer.promise
        }

        return { pending, respond }
    }

    const answerWith = async (
        request: { answer: ReturnType<typeof deferred> },
        q: string,
        name: string,
    ) => {
        request.answer.resolve(
            await json(searchFor(q, { agents: [agentWith({ name })] })),
        )
    }

    const agentsShown = () =>
        within(palette())
            .queryAllByRole('option')
            .filter((o) => o.closest('[role="group"]') !== null)
            .map((o) => o.textContent)
            .filter((text) => text?.startsWith('Agent-'))

    it('shows the first text’s rows only until the text changes, then loading until the new answer', async () => {
        const server = held()
        const fetchMock = mockSearch(server.respond)
        const user = await typeInto('/', 'ab')
        await advance(300)
        await until(() => expect(server.pending).toHaveLength(1))
        await answerWith(server.pending[0], 'ab', 'Agent-for-ab')
        await until(() => expect(agentsShown()).toHaveLength(1))

        expect(agentsShown()[0]).toContain('Agent-for-ab')

        // The next keystroke: the old rows go at once, before anything is asked.
        await user.type(searchRow(), 'c')

        expect(agentsShown()).toEqual([])
        expect(status()).toHaveTextContent('Searching…')

        await advance(300)
        await until(() => expect(server.pending).toHaveLength(2))

        expect(server.pending[1]?.q).toBe('abc')
        expect(agentsShown()).toEqual([])
        expect(status()).toHaveTextContent('Searching…')

        await answerWith(server.pending[1], 'abc', 'Agent-for-abc')
        await until(() => expect(agentsShown()).toHaveLength(1))

        expect(agentsShown()[0]).toContain('Agent-for-abc')
        expect(fetchMock.searches()).toHaveLength(2)
    })

    it('aborts the request of the text that was replaced, and drops its answer if it comes late', async () => {
        const server = held()
        mockSearch(server.respond)
        const user = await typeInto('/', 'ab')
        await advance(300)
        await until(() => expect(server.pending).toHaveLength(1))

        expect(server.pending[0]?.signal.aborted).toBe(false)

        await user.type(searchRow(), 'c')

        expect(server.pending[0]?.signal.aborted).toBe(true)

        await advance(300)
        await until(() => expect(server.pending).toHaveLength(2))
        await answerWith(server.pending[1], 'abc', 'Agent-for-abc')
        await until(() => expect(agentsShown()).toHaveLength(1))

        // The old request is answered after all.
        await answerWith(server.pending[0], 'ab', 'Agent-for-ab')
        await advance(300)

        expect(agentsShown()).toHaveLength(1)
        expect(agentsShown()[0]).toContain('Agent-for-abc')
        expect(
            within(palette()).queryByText(/Agent-for-ab$/),
        ).not.toBeInTheDocument()
        expect(status()).toHaveTextContent('1 result for “abc”.')
    })

    it('asks nothing for the text that was typed over inside the pause', async () => {
        const server = held()
        const fetchMock = mockSearch(server.respond)
        const user = await typeInto('/', 'ab')

        await user.type(searchRow(), 'c')
        await advance(300)
        await until(() => expect(server.pending).toHaveLength(1))

        expect(server.pending[0]?.q).toBe('abc')
        expect(fetchMock.searches()).toHaveLength(1)
    })

    it('stops asking once the palette is closed', async () => {
        const server = held()
        mockSearch(server.respond)
        const user = await typeInto('/', 'ab')
        await advance(300)
        await until(() => expect(server.pending).toHaveLength(1))

        await user.keyboard('{Escape}')

        expect(server.pending[0]?.signal.aborted).toBe(true)
    })

    it('does not poll: a shown answer is asked for once', async () => {
        const fetchMock = mockSearch(() =>
            json(searchFor('ab', { agents: [fixtureAgent] })),
        )
        await typeInto('/', 'ab')
        await advance(300)
        await until(() => expect(group('Agents')).toBeInTheDocument())
        await advance(10 * 60 * 1000)

        expect(fetchMock.searches()).toHaveLength(1)
    })
})
