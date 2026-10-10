import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '@/test/render-app'
import { stubResizeObserver } from '@/test/resize-observer'
import {
    advance,
    chord,
    clock,
    json,
    mockSearch,
    searchFor,
} from '@/test/palette-api'
import {
    editButton,
    fieldOf,
    pricesFixture,
    sonnet,
    tableLoaded,
} from '@/test/prices-api'
import {
    lastTraceUrl,
    loaded,
    paramsOf,
    searchBox,
    traceUrls,
} from '@/test/traces-api'
import { mockApi as mockUsageApi } from '@/test/usage-api'

beforeEach(() => {
    stubResizeObserver()
    vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
    vi.useRealTimers()
})

/** Opens the palette and closes it again, with the key and with Escape. */
async function openAndClose(user: ReturnType<typeof clock>) {
    await user.keyboard(chord)
    expect(screen.getByRole('dialog', { name: 'Search' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await advance(50)
    expect(
        screen.queryByRole('dialog', { name: 'Search' }),
    ).not.toBeInTheDocument()
}

describe('what the page holds while the palette is open', () => {
    it('keeps the text typed in a list’s search field, and the list shows it', async () => {
        const user = clock()
        const fetchMock = mockSearch(() => json(searchFor('')))
        renderApp('/traces')
        await loaded()

        await user.type(searchBox(), 'refund')
        // The field commits on blur, which is what opening the palette does to it.
        await openAndClose(user)

        expect(searchBox()).toHaveValue('refund')
        expect(window.location.search).toBe('?search=refund')
        await vi.waitFor(() =>
            expect(paramsOf(lastTraceUrl(fetchMock))).toMatchObject({
                search: 'refund',
            }),
        )
    })

    it('keeps the selection of rows on the list of runs', async () => {
        const user = clock()
        mockSearch(() => json(searchFor('')))
        renderApp('/traces')
        await loaded()

        const rows = () =>
            screen.getAllByRole('checkbox', { name: /^Select (?!all)/ })

        await user.click(rows()[1])
        await user.click(rows()[2])

        expect(rows()[1]).toBeChecked()
        expect(rows()[2]).toBeChecked()
        expect(rows()[0]).not.toBeChecked()
        expect(
            document.querySelector('[data-slot="selection-bar"]'),
        ).toBeInTheDocument()

        await openAndClose(user)

        expect(rows()[1]).toBeChecked()
        expect(rows()[2]).toBeChecked()
        expect(rows()[0]).not.toBeChecked()
        expect(
            document.querySelector('[data-slot="selection-bar"]'),
        ).toBeInTheDocument()
    })

    it('keeps an unsaved edit of a model’s price, and asks for nothing more', async () => {
        const user = clock()
        const fetchMock = mockUsageApi(undefined, undefined, undefined, () =>
            json(pricesFixture),
        )
        renderApp('/usage')
        await tableLoaded()

        await user.click(editButton(sonnet))
        await user.type(fieldOf(sonnet, 'Input'), '5')
        const typed = (fieldOf(sonnet, 'Input') as HTMLInputElement).value
        const requests = fetchMock.mock.calls.length

        await openAndClose(user)

        expect(typed).toMatch(/5$/)
        expect(fieldOf(sonnet, 'Input')).toHaveValue(typed)
        expect(fieldOf(sonnet, 'Input')).toBeInTheDocument()
        expect(fetchMock.mock.calls).toHaveLength(requests)
    })

    it('does not remount the list: a row keeps its element', async () => {
        const user = clock()
        const fetchMock = mockSearch(() => json(searchFor('')))
        renderApp('/traces')
        await loaded()
        const row = screen.getAllByRole('row')[1]
        const before = traceUrls(fetchMock).length

        await openAndClose(user)

        expect(screen.getAllByRole('row')[1]).toBe(row)
        expect(traceUrls(fetchMock)).toHaveLength(before)
    })
})
