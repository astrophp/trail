import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '@/test/render-app'
import {
    agentSelect,
    chips,
    conversationUrls,
    expectSearch,
    lastConversationUrl,
    loaded,
    metaFixture,
    mockApi,
    paramsOf,
    searchBox,
    tab,
    travel,
} from '@/test/conversations-api'

beforeEach(() => {
    mockApi()
    vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
    vi.useRealTimers()
})

const typing = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
const pause = (ms = 300) => act(() => vi.advanceTimersByTimeAsync(ms))
const entries = () => window.history.length

describe('search', () => {
    it('fills the box from the URL, asks the API for it and shows its chip', async () => {
        const fetchMock = mockApi()
        renderApp('/conversations?search=refund')
        await loaded()

        expect(searchBox()).toHaveValue('refund')
        expect(paramsOf(lastConversationUrl(fetchMock)).search).toBe('refund')
        expect(chips().getByText('Search: refund')).toBeVisible()
    })

    it('has the placeholder that says what is searched, and the length the API reads', async () => {
        renderApp('/conversations')
        await loaded()

        expect(searchBox()).toHaveAttribute(
            'placeholder',
            'Search user, conversation, or prompt…',
        )
        expect(searchBox()).toHaveAttribute('maxlength', '200')
    })

    it('waits for a pause in typing: keystrokes make one request and one history entry, on page 1', async () => {
        const user = typing()
        const fetchMock = mockApi()
        renderApp('/conversations?page=2')
        await loaded()

        const requests = conversationUrls(fetchMock).length
        const before = entries()

        await user.type(searchBox(), 'refund')

        expect(window.location.search).toBe('?page=2')
        expect(conversationUrls(fetchMock)).toHaveLength(requests)

        await pause()
        await expectSearch('?search=refund')
        await waitFor(() =>
            expect(conversationUrls(fetchMock)).toHaveLength(requests + 1),
        )
        expect(paramsOf(lastConversationUrl(fetchMock))).toMatchObject({
            search: 'refund',
            page: '1',
        })
        expect(entries()).toBe(before + 1)
        expect(searchBox()).toHaveFocus()
    })

    it('writes at once on Enter', async () => {
        const user = typing()
        renderApp('/conversations')
        await loaded()

        await user.type(searchBox(), 'refund{Enter}')

        await expectSearch('?search=refund')
    })

    it('goes back to the view before the search with Back', async () => {
        const user = typing()
        renderApp('/conversations?page=2')
        await loaded()

        await user.type(searchBox(), 'refund{Enter}')
        await expectSearch('?search=refund')

        await travel('back')
        await expectSearch('?page=2')
        await waitFor(() => expect(searchBox()).toHaveValue(''))
    })
})

describe('agent', () => {
    it('offers the agents seen in the range, selects the one in the URL and shows its chip', async () => {
        const fetchMock = mockApi()
        renderApp('/conversations?agent=SupportAssistant')
        await loaded()

        expect(agentSelect()).toHaveTextContent('SupportAssistant')
        expect(paramsOf(lastConversationUrl(fetchMock)).agent).toBe(
            'SupportAssistant',
        )
        expect(chips().getByText('Agent: SupportAssistant')).toBeVisible()

        await userEvent.click(agentSelect())

        expect(
            (await screen.findAllByRole('option')).map((o) => o.textContent),
        ).toEqual(['All agents', ...metaFixture.data.filters.agents])
    })

    it('picking an agent returns to page 1 in one history entry', async () => {
        const fetchMock = mockApi()
        renderApp('/conversations?page=3&sort=-turns')
        await loaded()

        const before = entries()

        await userEvent.click(agentSelect())
        await userEvent.click(
            await screen.findByRole('option', {
                name: metaFixture.data.filters.agents[0],
            }),
        )

        await expectSearch(
            `?sort=-turns&agent=${encodeURIComponent(metaFixture.data.filters.agents[0] ?? '')}`,
        )
        expect(entries()).toBe(before + 1)
        await waitFor(() =>
            expect(paramsOf(lastConversationUrl(fetchMock)).page).toBe('1'),
        )
    })
})

describe('the chips', () => {
    it('show the filters that are on, and none for the failures tab', async () => {
        renderApp('/conversations?search=refund&agent=Refunds&failed=1')
        await loaded()

        const items = chips().getAllByRole('listitem')

        expect(items).toHaveLength(2)
        expect(items[0]).toHaveTextContent('Search: refund')
        expect(items[1]).toHaveTextContent('Agent: Refunds')
    })

    it('are not drawn when no filter is on', async () => {
        renderApp('/conversations')
        await loaded()

        expect(
            screen.queryByRole('list', { name: 'Active filters' }),
        ).not.toBeInTheDocument()
    })

    it('remove one filter, keep the rest and return to page 1', async () => {
        const fetchMock = mockApi()
        renderApp('/conversations?page=2&search=refund&agent=Refunds')
        await loaded()

        await userEvent.click(
            chips().getByRole('button', {
                name: 'Remove filter: Search: refund',
            }),
        )

        await expectSearch('?agent=Refunds')
        await waitFor(() =>
            expect(paramsOf(lastConversationUrl(fetchMock))).not.toHaveProperty(
                'search',
            ),
        )
    })

    it('"Clear all" clears every filter including the tab, keeps the sort and moves focus to the search box', async () => {
        renderApp(
            '/conversations?sort=-cost&search=refund&agent=Refunds&failed=1',
        )
        await loaded()

        await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))

        await expectSearch('?sort=-cost')
        expect(searchBox()).toHaveFocus()
        expect(tab(/^All conversations/)).toHaveAttribute(
            'aria-selected',
            'true',
        )
    })
})
