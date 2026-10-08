import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderApp, appReady } from '@/test/render-app'
import {
    answerWith,
    conversationFixture,
    conversationUrls,
    dataRows,
    deferred,
    emptyList,
    expectSearch,
    header,
    json,
    lastConversationUrl,
    listFor,
    loaded,
    mockApi,
    paramsOf,
    searchBox,
    sortButton,
    tab,
    travel,
} from '@/test/conversations-api'

const never = () => new Promise<Response>(() => {})
const nextButton = () => screen.getByRole('button', { name: 'Next page' })
const table = () =>
    screen.getByRole('table', { name: 'Recorded conversations' })
const pickRange = async (name: string) => {
    await userEvent.click(screen.getByRole('combobox', { name: 'Time range' }))
    await userEvent.click(screen.getByRole('option', { name }))
}

beforeEach(() => {
    mockApi()
})

describe('the Conversations page', () => {
    it('asks for the default view explicitly and renders a row per conversation', async () => {
        const fetchMock = mockApi()
        renderApp('/conversations')
        await loaded()

        expect(conversationUrls(fetchMock)).toEqual([
            '/trail/api/conversations?range=24h&sort=-last_activity&page=1',
        ])
        expect(dataRows()).toHaveLength(conversationFixture.data.length)
        expect(
            screen.getByRole('heading', { level: 1, name: 'Conversations' }),
        ).toBeInTheDocument()
        expect(
            screen.getByText(
                "Understand the user's experience, one recorded turn at a time.",
            ),
        ).toBeVisible()
    })

    it('has the seven columns in order, sortable only where the API sorts', async () => {
        renderApp('/conversations')
        await loaded()

        const headers = within(table()).getAllByRole('columnheader')

        expect(headers.map((h) => h.textContent)).toEqual([
            'Conversation',
            'User',
            'Turns',
            'Failures',
            'Tokens',
            'Est. cost',
            'Last activity',
        ])
        expect(
            headers
                .filter((h) => h.getAttribute('aria-sort') !== null)
                .map((h) => h.textContent),
        ).toEqual(['Turns', 'Est. cost', 'Last activity'])
    })

    it('says in the footer what the totals cover, once there are rows', async () => {
        renderApp('/conversations')
        await loaded()

        expect(
            screen.getByText(
                'Totals cover every recorded turn of a conversation, including turns outside the selected period.',
            ),
        ).toBeVisible()
    })

    it('shows the tab counts from the response', async () => {
        renderApp('/conversations')
        await loaded()

        expect(within(tab(/^All conversations/)).getByText('60')).toBeVisible()
        expect(within(tab(/^With failures/)).getByText('7')).toBeVisible()
    })

    it('shows a zero count as a zero: the API said so', async () => {
        mockApi(() => json(emptyList))
        renderApp('/conversations')
        await screen.findByText('No conversations in this period')

        expect(within(tab(/^All conversations/)).getByText('0')).toBeVisible()
        expect(within(tab(/^With failures/)).getByText('0')).toBeVisible()
    })

    it('shows no count in a tab before the first answer', async () => {
        mockApi(never)
        renderApp('/conversations')
        await appReady()

        expect(tab(/^All conversations/)).toHaveTextContent(
            /^All conversations$/,
        )
        expect(tab(/^With failures/)).toHaveTextContent(/^With failures$/)
    })
})

describe('the URL drives the view', () => {
    it('requests what the URL says and marks the sorted column', async () => {
        const fetchMock = mockApi()
        renderApp(
            '/conversations?sort=-turns&page=2&range=7d&search=refund&agent=Refunds&failed=1',
        )
        await loaded()

        expect(conversationUrls(fetchMock)).toEqual([
            '/trail/api/conversations?range=7d&sort=-turns&page=2&search=refund&agent=Refunds&failed=1',
        ])
        expect(header(/Turns/)).toHaveAttribute('aria-sort', 'descending')
        expect(header(/Last activity/)).toHaveAttribute('aria-sort', 'none')
        expect(screen.getByText('Page 2 of 3')).toBeVisible()
        expect(
            screen.getByRole('combobox', { name: 'Time range' }),
        ).toHaveTextContent('Last 7 days')
        expect(tab(/^With failures/)).toHaveAttribute('aria-selected', 'true')
        expect(searchBox()).toHaveValue('refund')
    })

    it.each([
        ['last_activity', /Last activity/, 'ascending'],
        ['-last_activity', /Last activity/, 'descending'],
        ['turns', /Turns/, 'ascending'],
        ['-turns', /Turns/, 'descending'],
        ['cost', /Est\. cost/, 'ascending'],
        ['-cost', /Est\. cost/, 'descending'],
    ] as const)(
        'marks the column of ?sort=%s',
        async (sort, name, direction) => {
            const fetchMock = mockApi()
            renderApp(`/conversations?sort=${sort}`)
            await loaded()

            expect(header(name)).toHaveAttribute('aria-sort', direction)
            expect(paramsOf(lastConversationUrl(fetchMock)).sort).toBe(sort)
        },
    )

    it('is newest first by default', async () => {
        renderApp('/conversations')
        await loaded()

        expect(header(/Last activity/)).toHaveAttribute(
            'aria-sort',
            'descending',
        )
    })

    it('falls back to the defaults for an invalid sort, page or range', async () => {
        const fetchMock = mockApi()
        renderApp('/conversations?sort=bogus&page=0&range=forever')
        await loaded()

        expect(conversationUrls(fetchMock)).toEqual([
            '/trail/api/conversations?range=24h&sort=-last_activity&page=1',
        ])
    })
})

describe('the view drives the URL', () => {
    it.each([
        [/Turns/, '?sort=-turns'],
        [/Est\. cost/, '?sort=-cost'],
        // The default sort is already newest first, so the first click flips it.
        [/Last activity/, '?sort=last_activity'],
    ])('sorts %s with the first click', async (name, expected) => {
        renderApp('/conversations')
        await loaded()

        await userEvent.click(sortButton(name))

        await expectSearch(expected)
    })

    it('flips a sort on the second click and returns to page 1', async () => {
        const fetchMock = mockApi()
        renderApp('/conversations?page=2')
        await loaded()

        await userEvent.click(sortButton(/Turns/))
        await expectSearch('?sort=-turns')
        await waitFor(() =>
            expect(lastConversationUrl(fetchMock)).toBe(
                '/trail/api/conversations?range=24h&sort=-turns&page=1',
            ),
        )

        await userEvent.click(sortButton(/Turns/))
        await expectSearch('?sort=turns')
        expect(header(/Turns/)).toHaveAttribute('aria-sort', 'ascending')
    })

    it('pages forward, keeping the sort and the filters', async () => {
        const fetchMock = mockApi()
        renderApp('/conversations?sort=-cost&agent=Refunds')
        await loaded()

        await userEvent.click(nextButton())

        await expectSearch('?sort=-cost&page=2&agent=Refunds')
        await waitFor(() =>
            expect(lastConversationUrl(fetchMock)).toBe(
                '/trail/api/conversations?range=24h&sort=-cost&page=2&agent=Refunds',
            ),
        )
    })

    it('changes the range, returns to page 1 and keeps the filters, in one history entry', async () => {
        const fetchMock = mockApi()
        renderApp('/conversations?sort=-cost&page=3&failed=1')
        await loaded()

        const entries = window.history.length

        await pickRange('Last 7 days')

        await expectSearch('?sort=-cost&failed=1&range=7d')
        expect(window.history.length).toBe(entries + 1)
        await waitFor(() =>
            expect(lastConversationUrl(fetchMock)).toBe(
                '/trail/api/conversations?range=7d&sort=-cost&page=1&failed=1',
            ),
        )
    })

    it('restores the previous sort and page with Back', async () => {
        renderApp('/conversations')
        await loaded()

        await userEvent.click(sortButton(/Turns/))
        await userEvent.click(nextButton())
        await expectSearch('?sort=-turns&page=2')

        await travel('back')
        await expectSearch('?sort=-turns')
        await waitFor(() =>
            expect(header(/Turns/)).toHaveAttribute('aria-sort', 'descending'),
        )

        await travel('back')
        await expectSearch('')
        await waitFor(() =>
            expect(header(/Last activity/)).toHaveAttribute(
                'aria-sort',
                'descending',
            ),
        )
    })
})

describe('the failures tab is the failed filter', () => {
    it('asks for failed=1 on the second tab, returns to page 1 in one entry, and drops it on the first', async () => {
        const fetchMock = mockApi()
        renderApp('/conversations?page=2&sort=-turns')
        await loaded()

        expect(tab(/^All conversations/)).toHaveAttribute(
            'aria-selected',
            'true',
        )
        expect(paramsOf(lastConversationUrl(fetchMock))).not.toHaveProperty(
            'failed',
        )

        const entries = window.history.length

        await userEvent.click(tab(/^With failures/))

        await expectSearch('?sort=-turns&failed=1')
        expect(window.history.length).toBe(entries + 1)
        await waitFor(() =>
            expect(paramsOf(lastConversationUrl(fetchMock))).toMatchObject({
                failed: '1',
                page: '1',
            }),
        )

        await userEvent.click(tab(/^All conversations/))

        await expectSearch('?sort=-turns')
        await waitFor(() =>
            expect(paramsOf(lastConversationUrl(fetchMock))).not.toHaveProperty(
                'failed',
            ),
        )
    })

    it('is not a chip', async () => {
        renderApp('/conversations?failed=1')
        await loaded()

        expect(
            screen.queryByRole('list', { name: 'Active filters' }),
        ).not.toBeInTheDocument()
    })
})

describe('a page past the end', () => {
    it('lands on the real last page without adding a history entry', async () => {
        const fetchMock = mockApi()
        renderApp('/conversations?page=99')

        const entries = window.history.length

        await expectSearch('?page=3')
        await screen.findByText('Page 3 of 3')
        expect(window.history.length).toBe(entries)
        expect(lastConversationUrl(fetchMock)).toBe(
            '/trail/api/conversations?range=24h&sort=-last_activity&page=3',
        )
        expect(dataRows()).toHaveLength(conversationFixture.data.length)
    })

    it('does not show an empty table while it moves', async () => {
        mockApi((url) =>
            url.includes('page=99') ? json(listFor(url)) : never(),
        )
        renderApp('/conversations?page=99')
        await appReady()

        expect(table()).toHaveAttribute('aria-busy', 'true')
        expect(
            screen.queryByText('No conversations in this period'),
        ).not.toBeInTheDocument()
    })
})

describe('while the conversations load', () => {
    it('shows a table-shaped skeleton on the first load, with no count', async () => {
        mockApi(never)
        renderApp('/conversations')
        await appReady()

        expect(table()).toHaveAttribute('aria-busy', 'true')
        expect(within(table()).getAllByRole('columnheader')).toHaveLength(7)
        expect(table().querySelectorAll('tbody tr')).toHaveLength(8)
        expect(
            [...table().querySelectorAll('tbody td')].map((c) => c.textContent),
        ).toEqual(Array(8 * 7).fill(''))
        expect(screen.queryByText(/\d conversations$/)).not.toBeInTheDocument()
        expect(
            screen.queryByText(/^Totals cover every recorded turn/),
        ).not.toBeInTheDocument()
    })

    it('replaces the skeleton with the rows', async () => {
        const first = deferred()
        mockApi(() => first.promise)
        renderApp('/conversations')
        await appReady()

        first.resolve(new Response(JSON.stringify(listFor('?page=1'))))
        await screen.findByText('Page 1 of 3')

        expect(table()).not.toHaveAttribute('aria-busy')
        expect(dataRows()).toHaveLength(conversationFixture.data.length)
    })

    it('keeps the rows, dimmed and busy, while the next page loads, and keeps the page they belong to', async () => {
        const fetchMock = mockApi()
        renderApp('/conversations')
        await loaded()

        const next = deferred()
        answerWith(fetchMock, () => next.promise)

        await userEvent.click(nextButton())

        await waitFor(() => expect(conversationUrls(fetchMock)).toHaveLength(2))
        expect(dataRows()).toHaveLength(conversationFixture.data.length)
        expect(table()).toHaveAttribute('aria-busy', 'true')
        expect(table().querySelector('tbody')).toHaveClass('opacity-60')
        expect(screen.getByText('Page 1 of 3')).toBeVisible()
        expect(screen.getByText('1–25 of 60 conversations')).toBeVisible()

        next.resolve(
            new Response(
                JSON.stringify(listFor('/trail/api/conversations?page=2')),
            ),
        )

        await screen.findByText('Page 2 of 3')
        expect(table()).not.toHaveAttribute('aria-busy')
    })

    it('does not claim a new range is empty because the previous one was', async () => {
        const fetchMock = mockApi(() => json(emptyList))
        renderApp('/conversations?range=1h')
        await screen.findByText('No conversations in this period')

        answerWith(fetchMock, never)
        await pickRange('Last 24 hours')

        await waitFor(() =>
            expect(table()).toHaveAttribute('aria-busy', 'true'),
        )
        expect(
            screen.queryByText('No conversations in this period'),
        ).not.toBeInTheDocument()
    })
})

describe('when the conversations cannot be loaded', () => {
    it('shows the API’s message and status, and no table', async () => {
        mockApi(() => json({ message: 'The database is down.' }, 500))
        renderApp('/conversations')

        const alert = await screen.findByRole('alert')

        expect(alert).toHaveTextContent('The conversations could not be loaded')
        expect(alert).toHaveTextContent('The database is down.')
        expect(alert).toHaveTextContent('Error 500')
        expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })

    it('keeps the error state and its button while a retry runs, then shows the rows and moves focus off the gone button', async () => {
        const fetchMock = mockApi(() => json({ message: 'Down.' }, 500))
        renderApp('/conversations')
        await screen.findByRole('alert')

        const retry = deferred()
        answerWith(fetchMock, () => retry.promise)

        const button = screen.getByRole('button', { name: 'Try again' })
        button.focus()
        await userEvent.click(button)

        await waitFor(() => expect(conversationUrls(fetchMock)).toHaveLength(2))
        const busy = screen.getByRole('button', { name: 'Trying again…' })

        expect(busy).toBe(button)
        expect(busy).toHaveFocus()
        expect(screen.queryByRole('table')).not.toBeInTheDocument()

        retry.resolve(
            new Response(JSON.stringify(listFor('')), { status: 200 }),
        )

        await screen.findByText('Page 1 of 3')
        expect(dataRows()).toHaveLength(conversationFixture.data.length)
        expect(
            screen.getByRole('heading', { level: 1, name: 'Conversations' }),
        ).toHaveFocus()
    })

    it('says the server could not be reached on a network failure', async () => {
        mockApi(() => Promise.reject(new TypeError('Failed to fetch')))
        renderApp('/conversations')

        const alert = await screen.findByRole('alert')

        expect(alert).toHaveTextContent('The server could not be reached.')
    })

    it('does not leave another page’s rows up when the next page fails', async () => {
        const fetchMock = mockApi()
        renderApp('/conversations')
        await loaded()

        answerWith(fetchMock, () => json({ message: 'No.' }, 500))

        await userEvent.click(nextButton())

        expect(await screen.findByRole('alert')).toHaveTextContent('No.')
        expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })
})

describe('when the period holds no conversations', () => {
    it('says what a conversation is and where the other runs are, inside the table card, with no pagination and no footer note', async () => {
        mockApi(() => json(emptyList))
        renderApp('/conversations')

        const heading = await screen.findByRole('heading', {
            name: 'No conversations in this period',
        })

        expect(
            screen.getByText(
                "A conversation appears when an agent uses the SDK's conversation memory. Runs without one are on the Traces page.",
            ),
        ).toBeVisible()
        expect(heading.closest('[data-slot="data-table"]')).toBe(
            table().closest('[data-slot="data-table"]'),
        )
        expect(
            screen.queryByRole('navigation', { name: 'Pagination' }),
        ).not.toBeInTheDocument()
        expect(
            screen.queryByText(/^Totals cover every recorded turn/),
        ).not.toBeInTheDocument()
        expect(
            screen.queryByRole('button', { name: 'Clear filters' }),
        ).not.toBeInTheDocument()
    })
})

describe('when filters hide every conversation', () => {
    it('says none match, and "Clear filters" shows them again and puts focus in the search box', async () => {
        const fetchMock = mockApi((url) =>
            url.includes('search=zzz') ? json(emptyList) : json(listFor(url)),
        )
        renderApp('/conversations?search=zzz&sort=-turns')

        await screen.findByRole('heading', {
            name: 'No conversations match these filters',
        })

        expect(
            screen.queryByText('No conversations in this period'),
        ).not.toBeInTheDocument()
        expect(searchBox()).toHaveValue('zzz')

        await userEvent.click(
            screen.getByRole('button', { name: 'Clear filters' }),
        )

        await expectSearch('?sort=-turns')
        await waitFor(() =>
            expect(dataRows()).toHaveLength(conversationFixture.data.length),
        )
        expect(paramsOf(lastConversationUrl(fetchMock))).not.toHaveProperty(
            'search',
        )
        expect(searchBox()).toHaveFocus()
    })

    it('treats an empty "With failures" tab as a filter that hides everything, and clears it too', async () => {
        mockApi((url) =>
            url.includes('failed=1') ? json(emptyList) : json(listFor(url)),
        )
        renderApp('/conversations?failed=1')

        await screen.findByRole('heading', {
            name: 'No conversations match these filters',
        })

        await userEvent.click(
            screen.getByRole('button', { name: 'Clear filters' }),
        )

        await expectSearch('')
        await waitFor(() =>
            expect(dataRows()).toHaveLength(conversationFixture.data.length),
        )
        expect(tab(/^All conversations/)).toHaveAttribute(
            'aria-selected',
            'true',
        )
    })
})
