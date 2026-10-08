import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Conversation, StatusCounts, Usage, User } from '@/api/types'
import { renderApp } from '@/test/render-app'
import {
    cellsOf,
    json,
    listOf,
    loaded,
    mockApi,
    row,
    rowOf,
} from '@/test/conversations-api'

// Cells of a row, after its row header (the conversation): user, turns, failures, tokens, cost, last activity.
const [USER, TURNS, FAILURES, TOKENS, COST] = [0, 1, 2, 3, 4]

const noTurns: StatusCounts = {
    all: 0,
    completed: 0,
    failed: 0,
    incomplete: 0,
    running: 0,
    awaiting_approval: 0,
}

/** A conversation of the fixture's shape with some fields replaced. */
function made(id: string, overrides: Partial<Conversation>): Conversation {
    return { ...row('conversation-partial'), id, ...overrides }
}

async function showing(...rows: Conversation[]) {
    mockApi(() => json(listOf(rows)))
    renderApp('/conversations')
    await loaded()
}

const user = (id: string, name: string | null): User => ({
    id,
    type: 'App\\Models\\User',
    name,
    email: name === null ? null : `${id}@example.test`,
})

const reportedUsage: Usage = {
    state: 'reported',
    input_tokens: 10,
    output_tokens: 5,
    cache_read_tokens: null,
    cache_write_tokens: null,
    reasoning_tokens: null,
    total_tokens: 15,
}

beforeEach(() => {
    mockApi()
})

describe('the conversation cell', () => {
    it('leads with the latest prompt as the link, and the id and agents beneath', async () => {
        renderApp('/conversations')
        await loaded()

        const header = within(rowOf('conversation-shared')).getByRole(
            'rowheader',
        )

        expect(
            within(header).getByRole('link', { name: 'Approve it' }),
        ).toHaveAttribute('href', '/trail/conversations/conversation-shared')
        expect(
            within(header).getByTitle('conversation-shared'),
        ).toHaveTextContent('conversation-shared · Refunds, SupportAssistant')
    })

    it('says the prompt was not captured, and still links, when the latest turn has none', async () => {
        renderApp('/conversations')
        await loaded()

        const header = within(rowOf('conversation-bare')).getByRole('rowheader')

        expect(
            within(header).getByRole('link', { name: 'Prompt not captured' }),
        ).toHaveAttribute('href', '/trail/conversations/conversation-bare')
    })

    it('links an id with a slash, a space and non-ASCII characters as one path segment', async () => {
        const id = 'team/a b.é'
        await showing(made(id, {}))

        expect(
            within(rowOf(id)).getByRole('link', { name: 'Reopen it' }),
        ).toHaveAttribute('href', '/trail/conversations/team%2Fa%20b.%C3%A9')
    })

    it('adds "+N" from agent_count when the row’s list is shorter than the count', async () => {
        const id = 'many-agents'
        await showing(
            made(id, {
                agents: ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'],
                agent_count: 8,
            }),
        )

        expect(within(rowOf(id)).getByTitle(id)).toHaveTextContent(
            'many-agents · Alpha, Beta, Gamma, Delta, Epsilon +3',
        )
    })

    it('adds nothing when the list is the whole count', async () => {
        const id = 'two-agents'
        await showing(made(id, { agents: ['Alpha', 'Beta'], agent_count: 2 }))

        const line = within(rowOf(id)).getByTitle(id).textContent

        expect(line).toBe('two-agents · Alpha, Beta')
        expect(line).not.toContain('+')
    })
})

describe('the user cell', () => {
    it('shows the first user’s name with the email beneath', async () => {
        renderApp('/conversations')
        await loaded()

        const cell = within(rowOf('conversation-pending')).getAllByRole('cell')[
            USER
        ]

        expect(cell).toHaveTextContent('Adaada@example.test')
        expect(within(cell).queryByText(/\+/)).not.toBeInTheDocument()
    })

    it('adds "+N" from user_count when the row lists only some of the users', async () => {
        const id = 'many-users'
        await showing(
            made(id, {
                users: [
                    user('1', 'Ada'),
                    user('2', 'Grace'),
                    user('3', 'Linus'),
                ],
                user_count: 9,
            }),
        )

        const cell = within(rowOf(id)).getAllByRole('cell')[USER]

        expect(within(cell).getByText('Ada')).toBeVisible()
        expect(within(cell).queryByText('Grace')).not.toBeInTheDocument()
        expect(within(cell).getByText('+8')).toBeInTheDocument()
        expect(cell).toHaveTextContent('and 8 more users')
    })

    it('counts the second user of a short list from user_count too', async () => {
        await showing(row('conversation-shared'))

        const cell = within(rowOf('conversation-shared')).getAllByRole('cell')[
            USER
        ]

        expect(within(cell).getByText('+1')).toBeInTheDocument()
        expect(cell).toHaveTextContent('and 1 more user')
    })

    it('falls back to the id when the name can no longer be resolved, with no email', async () => {
        const id = 'unresolved'
        await showing(made(id, { users: [user('42', null)], user_count: 1 }))

        expect(cellsOf(id)[USER]).toBe('42')
    })

    it('shows nothing for a conversation with no user, as a run without one', async () => {
        renderApp('/conversations')
        await loaded()

        expect(cellsOf('conversation-partial')[USER]).toBe('')
        expect(cellsOf('conversation-bare')[USER]).toBe('')
    })
})

describe('the turns cell', () => {
    it('shows the total, and a running marker with its words when a turn is running', async () => {
        renderApp('/conversations')
        await loaded()

        const cell = within(rowOf('conversation-pending')).getAllByRole('cell')[
            TURNS
        ]
        const marker = cell.querySelector('[data-slot="status-badge"]')

        expect(marker).toHaveAttribute('data-status', 'running')
        expect(marker).toHaveTextContent('Running')
        expect(cell).toHaveTextContent('2 turns')
        expect(within(cell).getByTitle('1 running')).toBeInTheDocument()
    })

    it('marks a turn that awaits approval, in words', async () => {
        renderApp('/conversations')
        await loaded()

        const cell = within(rowOf('conversation-shared')).getAllByRole('cell')[
            TURNS
        ]
        const marker = cell.querySelector('[data-slot="status-badge"]')

        expect(marker).toHaveAttribute('data-status', 'awaiting_approval')
        expect(marker).toHaveTextContent('Awaiting approval')
        expect(
            within(cell).getByTitle('1 awaiting approval'),
        ).toBeInTheDocument()
    })

    it('has no marker when every turn is over', async () => {
        renderApp('/conversations')
        await loaded()

        const cell = within(rowOf('conversation-partial')).getAllByRole('cell')[
            TURNS
        ]

        expect(cell.querySelector('[data-slot="status-badge"]')).toBeNull()
        expect(cell).toHaveTextContent(/^2\s*turns$/)
    })

    it('shows both markers when both kinds are open', async () => {
        const id = 'both'
        await showing(
            made(id, {
                turns: { ...noTurns, all: 5, running: 2, awaiting_approval: 1 },
            }),
        )

        const cell = within(rowOf(id)).getAllByRole('cell')[TURNS]

        expect(
            [...cell.querySelectorAll('[data-slot="status-badge"]')].map((b) =>
                b.getAttribute('data-status'),
            ),
        ).toEqual(['running', 'awaiting_approval'])
        expect(cell).toHaveTextContent('5 turns')
    })
})

describe('the failures cell', () => {
    it('is a quiet dash that screen readers hear as "No failures" when there are none', async () => {
        renderApp('/conversations')
        await loaded()

        const cell = within(rowOf('conversation-pending')).getAllByRole('cell')[
            FAILURES
        ]

        expect(within(cell).getByText('No failures')).toHaveClass('sr-only')
        expect(within(cell).getByText('—')).toHaveAttribute(
            'aria-hidden',
            'true',
        )
        expect(cell).not.toHaveTextContent(/\d/)
    })

    it('is the count, in the destructive colour, when a turn failed', async () => {
        renderApp('/conversations')
        await loaded()

        const cell = within(rowOf('conversation-partial')).getAllByRole('cell')[
            FAILURES
        ]

        expect(cell).toHaveTextContent('1 failure')
        expect(cell.querySelector('.text-destructive')).not.toBeNull()
        expect(within(cell).queryByText('No failures')).not.toBeInTheDocument()
    })

    it('adds the incomplete turns to the failed ones', async () => {
        const id = 'mixed'
        await showing(
            made(id, {
                turns: { ...noTurns, all: 6, failed: 1, incomplete: 2 },
            }),
        )

        expect(cellsOf(id)[FAILURES]).toBe('3 failures')
    })
})

describe('tokens and cost', () => {
    it('reads a pending conversation as pending, not as the figures so far', async () => {
        renderApp('/conversations')
        await loaded()

        const cells = cellsOf('conversation-pending')

        expect(cells[TOKENS]).toBe('Pending')
        expect(cells[COST]).toBe('Pending')
        expect(cells.join(' ')).not.toMatch(/1[.,]?810|\$0\.0094?5/)
    })

    it('shows a partial estimate with its state', async () => {
        renderApp('/conversations')
        await loaded()

        const cell = within(rowOf('conversation-partial')).getAllByRole('cell')[
            COST
        ]

        expect(cell).toHaveTextContent('Partial')
        expect(cell).toHaveTextContent('$0.004')
    })

    it('shows the tokens a conversation reported', async () => {
        renderApp('/conversations')
        await loaded()

        expect(cellsOf('conversation-partial')[TOKENS]).toMatch(
            /1[.,]?010 tokens/,
        )
    })

    it('says unpriced for an unpriced conversation', async () => {
        const id = 'unpriced'
        await showing(
            made(id, {
                usage: reportedUsage,
                cost: { state: 'unpriced', amount: null },
            }),
        )

        expect(cellsOf(id)[COST]).toBe('Unpriced')
    })

    it('does not turn a count nobody reported into a zero', async () => {
        renderApp('/conversations')
        await loaded()

        for (const id of ['conversation-shared', 'conversation-bare']) {
            const cells = cellsOf(id)

            expect(cells[TOKENS]).toBe('Not reported')
            expect(cells[COST]).toBe('Not captured')
        }

        for (const cell of screen.getAllByRole('cell')) {
            expect(cell.textContent).not.toMatch(/^\s*(\$?0(\.0+)?)\s*$/)
        }
    })

    it('does not show a total when only a cache count was reported', async () => {
        const id = 'cache-only'
        await showing(
            made(id, {
                usage: {
                    ...reportedUsage,
                    input_tokens: null,
                    output_tokens: null,
                    cache_read_tokens: 12,
                    total_tokens: null,
                },
            }),
        )

        expect(cellsOf(id)[TOKENS]).toBe('Not reported')
    })
})

describe('last activity', () => {
    it('is the time of the latest turn, as the traces list shows when a run started', async () => {
        renderApp('/conversations')
        await loaded()

        const time = within(rowOf('conversation-pending'))
            .getAllByRole('cell')[5]
            .querySelector('time')

        expect(time).toHaveAttribute('datetime', '2026-01-02T11:55:00.000Z')
    })
})
