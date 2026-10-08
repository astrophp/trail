import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { conversationPath } from '@/lib/conversation-path'
import { appReady, renderApp } from '@/test/render-app'
import {
    call,
    deferred,
    json,
    message,
    mockTranscript,
    queryOf,
    transcriptFixture,
    transcriptUrls,
    turnOf,
    windowOf,
} from '@/test/transcript-api'

const route = (id = 'support/ada 1042', extra = '') =>
    `${conversationPath(id)}${extra}`

async function open(
    response = transcriptFixture,
    path = route(),
    fetchMock = mockTranscript(() => json(response)),
) {
    renderApp(path)
    await screen.findAllByRole('article', { name: /^Turn / })

    return fetchMock
}

const turn = (number: number) =>
    screen.getByRole('article', { name: `Turn ${number}` })
const heading = (name: string) => screen.getByRole('heading', { name })

beforeEach(() => {
    mockTranscript()
})

describe('the conversation page', () => {
    it('reads the newest window of the id in the address, with no other parameter', async () => {
        const fetchMock = await open()

        expect(transcriptUrls(fetchMock)).toEqual([
            '/trail/api/conversations/transcript?id=support%2Fada+1042',
        ])
        expect(
            screen.getByRole('heading', { level: 1, name: 'Conversation' }),
        ).toBeVisible()
        expect(document.title).toBe('Conversation support/ada 1042 · Trail')
    })

    it('shows the turns in order, numbered from the turns before the window', async () => {
        const turns = [turnOf('a'), turnOf('b'), turnOf('c')]

        await open(windowOf(turns, { older: 4 }))

        const articles = screen.getAllByRole('article')

        expect(articles.map((a) => a.getAttribute('aria-label'))).toEqual([
            'Turn 5',
            'Turn 6',
            'Turn 7',
        ])
        expect(within(articles[0]).getByText('Question of a')).toBeVisible()
        expect(within(articles[2]).getByText('Answer of c')).toBeVisible()
        expect(heading('#5')).toBeVisible()
    })

    it('shows the first turn as number 1 when nothing came before it', async () => {
        await open()

        expect(turn(1)).toBeVisible()
        expect(turn(3)).toBeVisible()
    })

    it('shows the prompt in a bubble beside the user and the response as text under the agent', async () => {
        await open()

        const first = turn(1)

        expect(within(first).getByText('Ada')).toBeVisible()
        expect(
            first.querySelector('[data-slot="turn-prompt"]'),
        ).toHaveTextContent('Where is order 1042?')
        expect(within(first).getByText('SupportAssistant')).toBeVisible()
        expect(within(first).getByText('claude-sonnet-4-5')).toBeVisible()
        expect(
            within(first).getByText(
                'Order 1042 shipped on 30 December and arrives tomorrow.',
            ),
        ).toBeVisible()
    })

    it('shows a response as text, never as markup', async () => {
        await open(
            windowOf([
                turnOf('a', {
                    messages: [
                        message('prompt', 'Hi'),
                        message('response', '<b>bold</b><script>1</script>'),
                    ],
                }),
            ]),
        )

        expect(
            within(turn(1)).getByText('<b>bold</b><script>1</script>'),
        ).toBeVisible()
        expect(turn(1).querySelector('b, script')).toBeNull()
    })

    it('shows the figures of a turn through the telemetry components, and links to its trace', async () => {
        await open()

        const meta = turn(1).querySelector('[data-slot="turn-meta"]')

        expect(meta).toHaveTextContent('4.20s')
        expect(meta).toHaveTextContent('1.7k')
        expect(meta).toHaveTextContent('$0.0078')
        expect(meta).toHaveTextContent('7')
        expect(
            within(turn(1)).getByRole('link', { name: /Inspect trace/ }),
        ).toHaveAttribute('href', '/trail/traces/t1')
    })

    it('says what the page shows, and does not claim to be complete', async () => {
        await open()

        expect(
            screen.getByText(
                'This page shows what was stored for each turn. Messages a turn resent from earlier in the conversation are left out.',
            ),
        ).toBeVisible()
        expect(document.body.textContent).not.toMatch(
            /continu|resum|followed|complete transcript|full transcript/i,
        )
    })
})

describe('the header and the side column', () => {
    it('shows the id with a copy button, the user and the first activity', async () => {
        await open()

        const header = document.querySelector('[data-slot="page-header"]')

        expect(header).toHaveTextContent('support/ada 1042')
        expect(header).toHaveTextContent('Ada')
        expect(header).toHaveTextContent('Jan 2 · 11:00:00')
        expect(
            within(header as HTMLElement).getByRole('button', {
                name: 'Copy conversation id',
            }),
        ).toBeVisible()
    })

    it('shortens a long id in the middle and keeps the whole one in the title', async () => {
        const id = '0199c2f4-6a1e-7c3b-9a55-0e8a4c1d2f30'

        await open(windowOf([turnOf('a')], { conversation: { id } }), route(id))

        expect(screen.getByTitle(id)).toHaveTextContent('0199c2f4…2f30')
        expect(document.title).toBe('Conversation 0199c2f4…2f30 · Trail')
    })

    it('counts the rest of the users and agents from the real counts', async () => {
        await open(
            windowOf([turnOf('a')], {
                conversation: {
                    user_count: 4,
                    agent_count: 7,
                    agents: ['Alpha', 'Beta'],
                },
            }),
        )

        expect(
            document.querySelector('[data-slot="page-header"]'),
        ).toHaveTextContent('+3')
        const agents = screen.getByRole('region', { name: 'Agents' })

        expect(agents).toHaveTextContent('Alpha')
        expect(agents).toHaveTextContent('Beta')
        expect(agents).toHaveTextContent('+5')
        expect(agents).not.toHaveTextContent('top-level')
    })

    it('shows no count of more when the lists are whole', async () => {
        await open()

        expect(
            screen.getByRole('region', { name: 'Agents' }).textContent,
        ).not.toMatch(/\+\d/)
    })

    it('lists the summary as label and value rows over all of the conversation', async () => {
        await open()

        const rows = within(
            screen.getByRole('region', { name: 'Session summary' }),
        )
        const row = (label: string) =>
            rows.getByText(label).closest('[data-slot="key-value"]')

        expect(row('Recorded turns')).toHaveTextContent('3')
        expect(row('Failed turns')).toHaveTextContent('0')
        expect(row('Awaiting approval')).toHaveTextContent('1')
        expect(rows.queryByText('Running')).not.toBeInTheDocument()
        expect(row('Input tokens')).toHaveTextContent('6,200')
        expect(row('Output tokens')).toHaveTextContent('460')
        expect(row('Estimated cost')).toHaveTextContent('$0.0255')
        expect(row('Last activity')).toHaveTextContent('Jan 2 · 11:09:00')
    })

    it('counts failed and incomplete turns together, and shows running ones when there are any', async () => {
        await open(
            windowOf([turnOf('a')], {
                conversation: {
                    turns: {
                        all: 9,
                        completed: 3,
                        failed: 2,
                        incomplete: 1,
                        running: 2,
                        awaiting_approval: 0,
                    },
                },
            }),
        )

        const rows = within(
            screen.getByRole('region', { name: 'Session summary' }),
        )

        expect(
            rows.getByText('Failed turns').closest('[data-slot="key-value"]'),
        ).toHaveTextContent('3')
        expect(
            rows.getByText('Running').closest('[data-slot="key-value"]'),
        ).toHaveTextContent('2')
        expect(rows.queryByText('Awaiting approval')).not.toBeInTheDocument()
    })

    it('says pending where the conversation’s figures are not final, and adds nothing up', async () => {
        await open(
            windowOf([turnOf('a')], {
                conversation: {
                    usage: {
                        state: 'pending',
                        input_tokens: 800,
                        output_tokens: 90,
                        cache_read_tokens: null,
                        cache_write_tokens: null,
                        reasoning_tokens: null,
                        total_tokens: 890,
                    },
                    cost: { state: 'pending', amount: 0.01 },
                },
            }),
        )

        const rows = within(
            screen.getByRole('region', { name: 'Session summary' }),
        )

        for (const label of [
            'Input tokens',
            'Output tokens',
            'Estimated cost',
        ]) {
            const row = rows.getByText(label).closest('[data-slot="key-value"]')

            expect(row).toHaveTextContent('Pending')
            expect(row?.textContent).not.toMatch(/800|90|\$/)
        }
    })

    it('says not reported where tokens were not, never zero', async () => {
        await open(
            windowOf([turnOf('a')], {
                conversation: {
                    usage: {
                        state: 'not_reported',
                        input_tokens: null,
                        output_tokens: null,
                        cache_read_tokens: null,
                        cache_write_tokens: null,
                        reasoning_tokens: null,
                        total_tokens: null,
                    },
                    cost: { state: 'not_captured', amount: null },
                },
            }),
        )

        const rows = within(
            screen.getByRole('region', { name: 'Session summary' }),
        )

        expect(
            rows.getByText('Input tokens').closest('[data-slot="key-value"]'),
        ).toHaveTextContent('Not reported')
        expect(
            rows.getByText('Estimated cost').closest('[data-slot="key-value"]'),
        ).toHaveTextContent('Not captured')
    })

    it('shows the line over the transcript with the recorded turns, the time span and the switch', async () => {
        await open()

        const transcript = screen.getByRole('region', { name: 'Transcript' })

        expect(transcript).toHaveTextContent('3 recorded turns')
        expect(transcript).toHaveTextContent('Jan 2 · 11:00:00 – 11:09:00')
        expect(
            within(transcript).getByRole('checkbox', { name: 'Show tools' }),
        ).toBeChecked()
    })

    it('counts the recorded turns of the conversation, not those loaded', async () => {
        await open(windowOf([turnOf('a'), turnOf('b')], { older: 18 }))

        expect(
            screen.getByRole('region', { name: 'Transcript' }),
        ).toHaveTextContent('20 recorded turns')
    })
})

describe('jumping to a turn', () => {
    it('lists the loaded turns with the start of the prompt and the status', async () => {
        await open(
            windowOf(
                [
                    turnOf('a', {
                        messages: [
                            message('activity', 'x', {
                                role: 'tool_result',
                            }),
                        ],
                    }),
                    turnOf('b', { trace: { status: 'failed' } }),
                ],
                { older: 5 },
            ),
        )

        const nav = within(
            screen.getByRole('navigation', { name: 'Jump to turn' }),
        )
        const items = nav.getAllByRole('link')

        expect(items).toHaveLength(2)
        expect(items[0]).toHaveTextContent('#6')
        expect(items[0]).toHaveTextContent('No prompt stored')
        expect(items[1]).toHaveTextContent('#7')
        expect(items[1]).toHaveTextContent('Question of b')
        expect(items[1]).toHaveTextContent('Failed')
    })

    it('scrolls to the turn and moves focus to its heading', async () => {
        const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')

        await open()

        await userEvent.click(
            within(
                screen.getByRole('navigation', { name: 'Jump to turn' }),
            ).getAllByRole('link')[2],
        )

        expect(scroll).toHaveBeenCalled()
        expect(heading('#3')).toHaveFocus()
        expect(window.location.search).not.toContain('turn')
    })
})

describe('tool chips', () => {
    it('links a known tool span to the run’s page with the span selected, with its status and time', async () => {
        await open()

        const chip = within(turn(1)).getByRole('link', { name: /lookup_order/ })

        expect(chip).toHaveAttribute('href', '/trail/traces/t1?span=t1-s03')
        expect(chip).toHaveTextContent('Completed')
        expect(chip).toHaveTextContent('121 ms')
    })

    it('shows a delegation as the agent, linked to the agent’s span', async () => {
        await open()

        const chip = within(turn(1)).getByRole('link', {
            name: /ShippingAgent/,
        })

        expect(chip).toHaveAttribute('href', '/trail/traces/t1?span=t1-s05')
        expect(chip).toHaveTextContent('Completed')
        expect(chip).toHaveTextContent('1.85s')
        expect(
            chip.querySelector('[data-slot="span-type-icon"]'),
        ).toHaveAttribute('data-type', 'agent')
    })

    it('shows a failed delegation by the agent’s status, not the tool span’s', async () => {
        await open(
            windowOf([
                turnOf('a', {
                    messages: [
                        message('prompt', 'Go'),
                        message('activity', '', {
                            tool_calls: [
                                call('Helper', {
                                    agent: {
                                        span_id: 'agent-span',
                                        name: 'Helper',
                                        agent_class: null,
                                        status: 'failed',
                                        issue_kind: null,
                                        provider: null,
                                        model: null,
                                        duration_ms: 50,
                                        pending_approvals: [],
                                        resolved_tool_call_ids: [],
                                    },
                                }),
                            ],
                        }),
                    ],
                }),
            ]),
        )

        const chip = within(turn(1)).getByRole('link', { name: /Helper/ })

        expect(chip).toHaveTextContent('Failed')
        expect(chip).not.toHaveTextContent('Completed')
    })

    it('shows a call waiting for approval without a link', async () => {
        await open()

        const chips = within(turn(3)).getByRole('list', { name: 'Tool calls' })

        expect(within(chips).queryByRole('link')).not.toBeInTheDocument()
        expect(chips).toHaveTextContent('refund_order')
        expect(chips).toHaveTextContent('Awaiting approval')
    })

    it('shows a call that has not started without a link', async () => {
        await open(
            windowOf([
                turnOf('a', {
                    trace: { status: 'running' },
                    messages: [
                        message('prompt', 'Go'),
                        message('activity', '', {
                            tool_calls: [
                                call('slow_tool', {
                                    link: 'not_started',
                                    span: null,
                                }),
                            ],
                        }),
                    ],
                }),
            ]),
        )

        const chips = within(turn(1)).getByRole('list', { name: 'Tool calls' })

        expect(within(chips).queryByRole('link')).not.toBeInTheDocument()
        expect(chips).toHaveTextContent('slow_tool')
        expect(chips).toHaveTextContent('Not started')
    })

    it('shows an unlinked call as its name alone: no link, no status, no time', async () => {
        await open(
            windowOf([
                turnOf('a', {
                    messages: [
                        message('prompt', 'Go'),
                        message('activity', '', {
                            tool_calls: [
                                call('mystery', {
                                    link: 'unlinked',
                                    span: null,
                                }),
                            ],
                        }),
                    ],
                }),
            ]),
        )

        const chips = within(turn(1)).getByRole('list', { name: 'Tool calls' })

        expect(chips).toHaveTextContent(/^mystery$/)
        expect(within(chips).queryByRole('link')).not.toBeInTheDocument()
        expect(chips.querySelector('[data-slot="status-badge"]')).toBeNull()
        expect(chips.querySelector('[data-slot="duration-value"]')).toBeNull()
    })

    it('takes the chips away with “Show tools”, keeps that in the address, and keeps it on remount', async () => {
        await open()

        expect(screen.getAllByRole('list', { name: 'Tool calls' }).length).toBe(
            2,
        )

        await userEvent.click(
            screen.getByRole('checkbox', { name: 'Show tools' }),
        )

        expect(screen.queryByRole('list', { name: 'Tool calls' })).toBeNull()
        expect(
            screen.getByRole('checkbox', { name: 'Show tools' }),
        ).not.toBeChecked()
        const query = new URLSearchParams(window.location.search)

        expect(query.get('tools')).toBe('0')
        expect(query.get('id')).toBe('support/ada 1042')

        // A reload: the same address, a fresh app.
        const address = `${window.location.pathname.replace('/trail', '')}${window.location.search}`

        document.body.innerHTML = ''
        renderApp(address)
        await screen.findByRole('article', { name: 'Turn 1' })

        expect(
            screen.getByRole('checkbox', { name: 'Show tools' }),
        ).not.toBeChecked()
        expect(screen.queryByRole('list', { name: 'Tool calls' })).toBeNull()
    })

    it('shows the chips again when switched back on, and leaves the address without the default', async () => {
        await open(transcriptFixture, route('support/ada 1042', '&tools=0'))

        expect(screen.queryByRole('list', { name: 'Tool calls' })).toBeNull()

        await userEvent.click(
            screen.getByRole('checkbox', { name: 'Show tools' }),
        )

        expect(
            screen.getAllByRole('list', { name: 'Tool calls' }).length,
        ).toBeGreaterThan(0)
        expect(window.location.search).not.toContain('tools')
    })

    it('opens every message of the activity as it was stored', async () => {
        await open()

        expect(screen.queryByText('Let me check.')).not.toBeInTheDocument()

        await userEvent.click(
            within(turn(1)).getByRole('button', { name: 'Show messages' }),
        )

        const list = within(
            within(turn(1)).getByRole('list', { name: 'Activity of turn 1' }),
        )
        const items = list.getAllByRole('listitem', { name: /^Message \d$/ })

        expect(items).toHaveLength(2)
        expect(within(items[0]).getByText('assistant')).toBeVisible()
        expect(within(items[0]).getByText('Let me check.')).toBeVisible()
        expect(within(items[1]).getByText('tool_result')).toBeVisible()
        expect(
            within(turn(1)).getByRole('button', { name: 'Hide messages' }),
        ).toHaveAttribute('aria-expanded', 'true')
    })

    it('keeps the messages disclosure when the tools are switched off', async () => {
        await open(transcriptFixture, route('support/ada 1042', '&tools=0'))

        expect(
            within(turn(1)).getByRole('button', { name: 'Show messages' }),
        ).toBeVisible()
    })
})

describe('turns that did not complete', () => {
    it('shows the error where a failed turn’s response would be, and no response', async () => {
        await open(
            windowOf([
                turnOf('a', {
                    trace: { status: 'failed', issue_kind: 'rate_limited' },
                    detail: {
                        error: {
                            class: 'RateLimitedException',
                            message: 'Slow down.',
                            source: 'step',
                            http_status: 429,
                        },
                        pending_approvals: [],
                        resolved_tool_call_ids: [],
                    },
                    messages: [message('prompt', 'Go')],
                }),
            ]),
        )

        const failed = turn(1)

        expect(within(failed).getByText('No completed response')).toBeVisible()
        expect(within(failed).getByText('Slow down.')).toBeVisible()
        expect(within(failed).getByText('HTTP 429')).toBeVisible()
        expect(within(failed).getByText('Failed')).toBeVisible()
        expect(within(failed).getByText('Rate limited')).toBeVisible()
        expect(failed.querySelector('[data-variant="plain"]')).toBeNull()
    })

    it('claims no cause for a failed turn with no error recorded', async () => {
        await open(
            windowOf([
                turnOf('a', {
                    trace: { status: 'failed' },
                    messages: [message('prompt', 'Go')],
                }),
            ]),
        )

        expect(within(turn(1)).getByText('No completed response')).toBeVisible()
        expect(
            within(turn(1)).queryByRole('group', { name: 'Error' }),
        ).toBeNull()
        expect(turn(1).textContent).not.toMatch(/No error was recorded/)
    })

    it('says an incomplete turn has no completed response', async () => {
        await open(
            windowOf([
                turnOf('a', {
                    trace: { status: 'incomplete' },
                    messages: [message('prompt', 'Go')],
                }),
            ]),
        )

        expect(within(turn(1)).getByText('No completed response')).toBeVisible()
        expect(within(turn(1)).getByText('Incomplete')).toBeVisible()
    })

    it('says a running turn is in progress', async () => {
        await open(
            windowOf([
                turnOf('a', {
                    trace: {
                        status: 'running',
                        duration_ms: null,
                        ended_at: null,
                        usage: {
                            state: 'pending',
                            input_tokens: null,
                            output_tokens: null,
                            cache_read_tokens: null,
                            cache_write_tokens: null,
                            reasoning_tokens: null,
                            total_tokens: null,
                        },
                        cost: { state: 'pending', amount: null },
                    },
                    messages: [message('prompt', 'Go')],
                }),
            ]),
        )

        const running = turn(1)

        expect(
            within(running).getAllByText('In progress').length,
        ).toBeGreaterThanOrEqual(1)
        expect(
            running.querySelector('[data-slot="turn-response"]'),
        ).toHaveTextContent('In progress')
        expect(
            running.querySelector('[data-slot="turn-meta"]'),
        ).toHaveTextContent('Pending')
        expect(within(running).queryByText('No completed response')).toBeNull()
    })

    it('names the tools an awaiting turn waits for, and shows the waiting calls on request', async () => {
        await open()

        const waiting = turn(3)

        expect(
            within(waiting).getByRole('status', {
                name: undefined,
            }),
        ).toHaveTextContent('Waiting for approval of: refund_order')

        await userEvent.click(
            within(waiting).getByRole('button', {
                name: 'Show the waiting tool calls',
            }),
        )

        expect(within(waiting).getByText('toolu_09')).toBeVisible()
        expect(within(waiting).getByText('Moves money')).toBeVisible()
    })

    it('shows the earlier attempts of a failover only on request', async () => {
        await open()

        const failover = turn(2)

        expect(
            within(failover).queryByText(
                'Application rate limited by AI provider [openai].',
            ),
        ).toBeNull()

        const note = within(failover).getByRole('button', {
            name: '2 attempts',
        })

        expect(note).toHaveAttribute('aria-expanded', 'false')

        await userEvent.click(note)

        expect(
            within(failover).getByText(
                'Application rate limited by AI provider [openai].',
            ),
        ).toBeVisible()
        expect(within(failover).getByText('HTTP 429')).toBeVisible()
        expect(within(failover).getByText('openai · gpt-5')).toBeVisible()
        // The attempt the run ended on is not listed as a failure.
        expect(within(failover).getAllByText(/^Attempt \d$/)).toHaveLength(1)
    })

    it('has no attempts note for a run with one attempt', async () => {
        await open()

        expect(
            within(turn(1)).queryByRole('button', { name: /attempts/ }),
        ).toBeNull()
    })
})

describe('what a turn stored', () => {
    it('shows no bubble and no placeholder for a turn that starts at a tool result', async () => {
        await open(
            windowOf([
                turnOf('a'),
                turnOf('b', {
                    messages: [
                        message('activity', null, {
                            role: 'tool_result',
                            tool_results: [
                                {
                                    id: 'x',
                                    name: 'lookup',
                                    result: 'ok',
                                    span_id: null,
                                },
                            ],
                        }),
                        message('response', 'Done.'),
                    ],
                }),
            ]),
        )

        // A turn with a prompt has the bubble; the one without has nothing in its place.
        expect(
            turn(1).querySelector('[data-slot="turn-prompt"]'),
        ).not.toBeNull()
        expect(turn(2).querySelector('[data-slot="turn-prompt"]')).toBeNull()
        expect(turn(2).querySelector('[data-variant="bubble"]')).toBeNull()
        expect(turn(2).textContent).not.toMatch(/prompt/i)
        expect(within(turn(2)).getByText('Done.')).toBeVisible()
    })

    it('shows no name beside a bubble for a turn with no user', async () => {
        await open(windowOf([turnOf('a', { trace: { user: null } })]))

        const prompt = turn(1).querySelector('[data-slot="turn-prompt"]')

        expect(prompt).toHaveTextContent('Question of a')
        expect(prompt?.querySelector('[data-slot="user-label"]')).toBeNull()
    })

    it('says no messages were stored, keeps the header and figures, and does not blame capture', async () => {
        await open(
            windowOf([
                turnOf('a', {
                    messages_state: 'not_stored',
                    messages_reason: null,
                    messages: [],
                }),
            ]),
        )

        const stored = turn(1)

        expect(
            within(stored).getByText('No messages were stored for this turn.'),
        ).toBeVisible()
        expect(within(stored).getByText('Completed')).toBeVisible()
        expect(
            stored.querySelector('[data-slot="turn-meta"]'),
        ).toHaveTextContent('4.20s')
        expect(
            within(stored).getByRole('link', { name: /Inspect trace/ }),
        ).toBeVisible()
        expect(stored.textContent).not.toMatch(/captur|disabled|off\b/i)
        expect(stored.querySelector('[data-slot="notice"]')?.textContent).toBe(
            'No messages were stored for this turn.',
        )
    })

    it.each([
        ['span_limit', 'Only the first spans of this run were read.'],
        [
            'offset_gap',
            'Some messages of this turn could not be placed and may be missing.',
        ],
        [
            'history_rewritten',
            'Some messages of this turn could not be placed and may be missing.',
        ],
        [
            'history_boundary_unknown',
            'Some messages of this turn could not be placed and may be missing.',
        ],
        [
            'step_input_missing',
            'Some messages of this turn could not be placed and may be missing.',
        ],
    ] as const)(
        'says what a partial turn is missing for %s',
        async (reason, words) => {
            await open(
                windowOf([
                    turnOf('a', {
                        messages_state: 'partial',
                        messages_reason: reason,
                    }),
                ]),
            )

            const notice = turn(1).querySelector('[data-slot="notice"]')

            expect(notice).toHaveTextContent(
                'Some messages of this turn may be missing',
            )
            expect(notice).toHaveTextContent(words)
            expect(notice?.textContent).not.toMatch(/captur/i)
        },
    )

    it('shows no notice for a turn whose messages were all stored', async () => {
        await open()

        expect(turn(1).querySelector('[data-slot="notice"]')).toBeNull()
    })

    it('marks a part that was cut short, with its length', async () => {
        await open()

        await userEvent.click(
            within(turn(1)).getByRole('button', { name: 'Show messages' }),
        )

        expect(
            within(turn(1)).getByText(
                'This value was cut short when it was stored.',
            ),
        ).toBeVisible()
        expect(
            within(turn(1)).getByText('It was 18,422 characters.'),
        ).toBeVisible()
    })

    it('marks a cut prompt in its bubble', async () => {
        await open(
            windowOf([
                turnOf('a', {
                    messages: [
                        message('prompt', 'Summarise the following', {
                            truncated_paths: { content: 90000 },
                            source: {
                                span_id: 's',
                                path: 'input.messages.0',
                                redacted: false,
                                truncated: true,
                            },
                        }),
                    ],
                }),
            ]),
        )

        const prompt = turn(1).querySelector('[data-slot="turn-prompt"]')

        expect(prompt).toHaveTextContent('cut short when it was stored')
        expect(prompt).toHaveTextContent('It was 90,000 characters.')
    })

    it('marks what was redacted where it stands', async () => {
        await open(
            windowOf([
                turnOf('a', {
                    messages: [
                        message('prompt', 'My card is [redacted].'),
                        message('response', 'Noted [redacted].'),
                    ],
                }),
            ]),
        )

        expect(
            turn(1).querySelectorAll('[data-slot="redaction"]'),
        ).toHaveLength(2)
    })

    it('caps a long message and reveals the rest on request', async () => {
        const long = `${'word '.repeat(1500)}END`

        await open(
            windowOf([
                turnOf('a', {
                    messages: [
                        message('prompt', 'Hi'),
                        message('response', long),
                    ],
                }),
            ]),
        )

        const response = turn(1).querySelector('[data-slot="turn-response"]')
        const more = within(response as HTMLElement).getByRole('button', {
            name: /Show more/,
        })

        expect(response?.textContent).not.toContain('END')

        await userEvent.click(more)

        expect(response?.textContent).toContain('END')
        expect(
            within(response as HTMLElement).queryByRole('button', {
                name: /Show more/,
            }),
        ).toBeNull()
    })
})

describe('earlier turns', () => {
    const newest = () => windowOf([turnOf('c'), turnOf('d')], { older: 12 })
    const earlier = (older: number) =>
        windowOf([turnOf('a'), turnOf('b')], { older })
    const button = () =>
        screen.getByRole('button', { name: /^(Show earlier turns|Try again)/ })

    it('offers the earlier turns with the database’s count, not a count of what is loaded', async () => {
        await open(newest())

        expect(button()).toHaveTextContent('Show earlier turns (12)')
    })

    it('offers nothing when no turn came before', async () => {
        await open()

        expect(
            screen.queryByRole('button', { name: /earlier turns/ }),
        ).toBeNull()
    })

    it('puts the earlier window before the loaded turns, numbers it, and moves focus to its first heading', async () => {
        const fetchMock = await open(
            newest(),
            route(),
            mockTranscript((url) =>
                json(queryOf(url).has('before') ? earlier(10) : newest()),
            ),
        )

        await userEvent.click(button())
        await screen.findByRole('article', { name: 'Turn 11' })

        const urls = transcriptUrls(fetchMock)

        expect(queryOf(urls[1]).get('before')).toBe('c')
        expect(queryOf(urls[1]).get('id')).toBe('support/ada 1042')
        expect(
            screen
                .getAllByRole('article')
                .map((a) => a.getAttribute('aria-label')),
        ).toEqual(['Turn 11', 'Turn 12', 'Turn 13', 'Turn 14'])
        expect(within(turn(11)).getByText('Question of a')).toBeVisible()
        expect(button()).toHaveTextContent('Show earlier turns (10)')
        await waitFor(() => expect(heading('#11')).toHaveFocus())
    })

    it('takes the button away when nothing is left', async () => {
        await open(
            newest(),
            route(),
            mockTranscript((url) =>
                json(queryOf(url).has('before') ? earlier(0) : newest()),
            ),
        )

        await userEvent.click(button())
        await screen.findByRole('article', { name: 'Turn 1' })

        expect(
            screen.queryByRole('button', { name: /earlier turns/ }),
        ).toBeNull()
        expect(screen.getAllByRole('article')).toHaveLength(4)
    })

    it('lists the loaded turns in the jump list, earlier ones included', async () => {
        await open(
            newest(),
            route(),
            mockTranscript((url) =>
                json(queryOf(url).has('before') ? earlier(10) : newest()),
            ),
        )
        const nav = () =>
            within(screen.getByRole('navigation', { name: 'Jump to turn' }))

        expect(nav().getAllByRole('link')).toHaveLength(2)

        await userEvent.click(button())
        await screen.findByRole('article', { name: 'Turn 11' })

        expect(nav().getAllByRole('link')).toHaveLength(4)
    })

    it('shows the button busy while it loads, and keeps focus on it until the turns arrive', async () => {
        const pending = deferred()

        await open(
            newest(),
            route(),
            mockTranscript((url) =>
                queryOf(url).has('before') ? pending.promise : json(newest()),
            ),
        )
        await userEvent.click(button())

        const busy = await screen.findByRole('button', {
            name: 'Loading earlier turns…',
        })

        expect(busy).toHaveAttribute('aria-disabled', 'true')
        expect(busy).toHaveFocus()

        pending.resolve(new Response(JSON.stringify(earlier(10))))
        await screen.findByRole('article', { name: 'Turn 11' })
    })

    it('keeps the reader’s place when turns are put before it', async () => {
        const scrollBy = vi.fn()
        let top = 100

        window.scrollBy = scrollBy
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
            function (this: Element) {
                return this.id === 'turn-c'
                    ? ({ top } as DOMRect)
                    : ({ top: 0 } as DOMRect)
            },
        )

        await open(
            newest(),
            route(),
            mockTranscript((url) => {
                if (queryOf(url).has('before')) {
                    // The turns have been added before the reader’s turn moves it down.
                    top = 900

                    return json(earlier(10))
                }

                return json(newest())
            }),
        )
        await userEvent.click(button())
        await screen.findByRole('article', { name: 'Turn 11' })

        expect(scrollBy).toHaveBeenCalledWith(0, 800)
    })

    it('says inline that earlier turns could not be loaded, keeps the loaded ones, and retries', async () => {
        let failing = true

        await open(
            newest(),
            route(),
            mockTranscript((url) => {
                if (!queryOf(url).has('before')) {
                    return json(newest())
                }

                return failing
                    ? json({ message: 'Database unavailable.' }, 500)
                    : json(earlier(10))
            }),
        )
        await userEvent.click(button())

        const alert = await screen.findByRole('alert')

        expect(alert).toHaveTextContent('Earlier turns could not be loaded')
        expect(alert).toHaveTextContent('Database unavailable.')
        expect(turn(13)).toBeVisible()
        expect(turn(14)).toBeVisible()
        expect(button()).toHaveTextContent('Try again (12 earlier turns)')

        failing = false
        await userEvent.click(button())
        await screen.findByRole('article', { name: 'Turn 11' })

        expect(screen.queryByRole('alert')).toBeNull()
        expect(screen.getAllByRole('article')).toHaveLength(4)
    })
})

describe('states', () => {
    it('shows a skeleton shaped like the page while loading', async () => {
        mockTranscript(() => new Promise<Response>(() => {}))
        renderApp(route())
        await appReady()

        expect(
            await screen.findByRole('status', { name: 'Loading conversation' }),
        ).toBeVisible()
        expect(
            screen.getByRole('heading', { level: 1, name: 'Conversation' }),
        ).toBeVisible()
    })

    it('says a conversation that does not exist was not found, with the way back', async () => {
        mockTranscript(() => json({ message: 'Not found.' }, 404))
        renderApp(route('missing'))

        expect(
            await screen.findByRole('heading', {
                name: 'This conversation was not found',
            }),
        ).toBeVisible()
        expect(
            screen.getByRole('link', { name: 'Back to Conversations' }),
        ).toHaveAttribute('href', '/trail/conversations')
        expect(document.title).toBe('Conversation · Trail')
    })

    it.each(['', '?id=', '?id=&tools=0'])(
        'says not found for an address with no id (%j) without a request',
        async (query) => {
            const fetchMock = mockTranscript()

            renderApp(`/conversations/transcript${query}`)

            expect(
                await screen.findByRole('heading', {
                    name: 'This conversation was not found',
                }),
            ).toBeVisible()
            expect(transcriptUrls(fetchMock)).toEqual([])
        },
    )

    it('says the request failed and retries, handing focus back to the page when it works', async () => {
        let failing = true

        mockTranscript(() =>
            failing
                ? json({ message: 'Server error.' }, 500)
                : json(transcriptFixture),
        )
        renderApp(route())

        const retry = await screen.findByRole('button', { name: 'Try again' })

        expect(
            screen.getByRole('heading', {
                name: 'The conversation could not be loaded',
            }),
        ).toBeVisible()
        expect(
            screen.queryByRole('heading', {
                name: 'This conversation was not found',
            }),
        ).toBeNull()

        failing = false
        retry.focus()
        await userEvent.click(retry)
        await screen.findByRole('article', { name: 'Turn 1' })

        expect(screen.queryByRole('alert')).toBeNull()
        await waitFor(() =>
            expect(document.activeElement).not.toBe(document.body),
        )
    })

    it.each([
        'plain-id',
        'support/ada 1042',
        'café ☕ 日本語',
        'a+b&c=d?e#f%20g',
        ' padded ',
    ])('sends the id %j exactly as it is', async (id) => {
        const fetchMock = mockTranscript(() =>
            json(windowOf([turnOf('a')], { conversation: { id } })),
        )

        renderApp(conversationPath(id))
        await screen.findByRole('article', { name: 'Turn 1' })

        const [url] = transcriptUrls(fetchMock)

        expect(queryOf(url).get('id')).toBe(id)
        expect([...queryOf(url).keys()]).toEqual(['id'])
    })

    it('does not show one conversation’s turns under another’s header', async () => {
        const never = deferred()

        mockTranscript((url) =>
            queryOf(url).get('id') === 'first'
                ? json(
                      windowOf([turnOf('one')], {
                          conversation: { id: 'first' },
                      }),
                  )
                : never.promise,
        )
        renderApp(route('first'))
        await screen.findByRole('article', { name: 'Turn 1' })

        window.history.pushState(
            {},
            '',
            '/trail/conversations/transcript?id=second',
        )
        window.dispatchEvent(new PopStateEvent('popstate'))

        expect(
            await screen.findByRole('status', { name: 'Loading conversation' }),
        ).toBeVisible()
        expect(screen.queryByRole('article')).toBeNull()
    })
})
