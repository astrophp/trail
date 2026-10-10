import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link } from 'react-router'
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
    type MockInstance,
} from 'vitest'
import { leaveWarning } from '@/features/usage/use-leave-warning'
import { until } from '@/test/wait'
import {
    editButton,
    expectNotEditing,
    fieldOf,
    formOf,
    priceServer,
    priceFixture,
    priceWrites,
    renderPrices,
    sonnet,
    sonnetDated,
    tableLoaded,
} from '@/test/prices-api'

let confirm: MockInstance<typeof window.confirm>

beforeEach(() => {
    confirm = vi.spyOn(window, 'confirm')
})

afterEach(() => {
    confirm.mockRestore()
})

const traces = () => screen.getByRole('link', { name: 'Traces' })

/** What the browser is asked when the tab is closed or reloaded: whether the page objects. */
function closeTab(): boolean {
    const event = new Event('beforeunload', { cancelable: true })

    window.dispatchEvent(event)

    return event.defaultPrevented
}

describe('leaving the page with unsaved prices', () => {
    it('does not ask when no row is being edited', async () => {
        const user = userEvent.setup()
        priceServer()
        renderPrices()
        await tableLoaded()

        await user.click(traces())

        expect(window.location.pathname).toBe('/trail/traces')
        expect(confirm).not.toHaveBeenCalled()
        expect(closeTab()).toBe(false)
    })

    it('does not ask for a row that was opened and not changed', async () => {
        const user = userEvent.setup()
        priceServer()
        renderPrices()
        await tableLoaded()

        await user.click(editButton(sonnet))
        await user.click(traces())

        expect(fieldOf(sonnet, 'Input')).toBeVisible()
        expect(window.location.pathname).toBe('/trail/traces')
        expect(confirm).not.toHaveBeenCalled()
        expect(closeTab()).toBe(false)
    })

    it('asks once before a link of the app leaves the page, and stays when declined', async () => {
        const user = userEvent.setup()
        confirm.mockReturnValue(false)
        priceServer()
        renderPrices()
        await tableLoaded()

        await user.click(editButton(sonnet))
        await user.type(fieldOf(sonnet, 'Input'), '5')
        await user.click(traces())

        expect(confirm).toHaveBeenCalledTimes(1)
        expect(confirm).toHaveBeenCalledWith(leaveWarning)
        expect(window.location.pathname).toBe('/trail/usage')
        expect(fieldOf(sonnet, 'Input')).toHaveValue('35')
    })

    it('leaves when confirmed, after that one question', async () => {
        const user = userEvent.setup()
        confirm.mockReturnValue(true)
        priceServer()
        renderPrices()
        await tableLoaded()

        await user.click(editButton(sonnet))
        await user.type(fieldOf(sonnet, 'Input'), '5')
        await user.click(traces())

        expect(confirm).toHaveBeenCalledTimes(1)
        expect(window.location.pathname).toBe('/trail/traces')
    })

    it('asks the browser before the tab is closed or reloaded', async () => {
        const user = userEvent.setup()
        priceServer()
        renderPrices()
        await tableLoaded()

        await user.click(editButton(sonnet))
        await user.type(fieldOf(sonnet, 'Input'), '5')

        expect(closeTab()).toBe(true)
    })

    it('counts a rate cleared as a change, and a rate typed back as none', async () => {
        const user = userEvent.setup()
        priceServer()
        renderPrices()
        await tableLoaded()

        await user.click(editButton(sonnet))
        await user.clear(fieldOf(sonnet, 'Input'))

        expect(closeTab()).toBe(true)

        await user.type(fieldOf(sonnet, 'Input'), '3.0')

        expect(closeTab()).toBe(false)
    })

    it('does not ask for a link that stays on this page, or one opened elsewhere', async () => {
        const user = userEvent.setup()
        priceServer()
        renderPrices({
            beside: (
                <>
                    <Link to="/usage?range=7d">Another range</Link>
                    <Link to="/traces" target="_blank">
                        Traces in a new tab
                    </Link>
                </>
            ),
        })
        await tableLoaded()

        await user.click(editButton(sonnet))
        await user.type(fieldOf(sonnet, 'Input'), '5')
        await user.click(screen.getByRole('link', { name: 'Another range' }))

        expect(window.location.search).toBe('?range=7d')

        // The browser would open these elsewhere; jsdom has nowhere to, so the default is cancelled.
        const stay = (event: Event) => event.preventDefault()
        document.addEventListener('click', stay)

        for (const link of [
            screen.getByRole('link', { name: 'Traces in a new tab' }),
            traces(),
        ]) {
            link.dispatchEvent(
                new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    ctrlKey: link === traces(),
                }),
            )
        }

        document.removeEventListener('click', stay)

        expect(confirm).not.toHaveBeenCalled()
        expect(window.location.pathname).toBe('/trail/usage')
        expect(fieldOf(sonnet, 'Input')).toHaveValue('35')
    })

    it('does not ask after a cancel', async () => {
        const user = userEvent.setup()
        priceServer()
        renderPrices()
        await tableLoaded()

        await user.click(editButton(sonnet))
        await user.type(fieldOf(sonnet, 'Input'), '5')

        expect(closeTab()).toBe(true)

        await user.click(
            within(formOf(sonnet)).getByRole('button', { name: 'Cancel' }),
        )

        expect(closeTab()).toBe(false)

        await user.click(traces())

        expect(window.location.pathname).toBe('/trail/traces')
        expect(confirm).not.toHaveBeenCalled()
    })

    it('does not ask after a save', async () => {
        const user = userEvent.setup()
        const server = priceServer()
        server.answers(priceFixture.data)
        renderPrices()
        await tableLoaded()

        await user.click(editButton(sonnetDated))
        await user.type(fieldOf(sonnetDated, 'Input'), '5')

        expect(closeTab()).toBe(true)

        await user.click(
            within(formOf(sonnetDated)).getByRole('button', { name: 'Save' }),
        )
        await until(() => expect(priceWrites(server.fetchMock)).toHaveLength(1))
        await until(() => expectNotEditing(sonnetDated))

        expect(closeTab()).toBe(false)

        await user.click(traces())

        expect(window.location.pathname).toBe('/trail/traces')
        expect(confirm).not.toHaveBeenCalled()
    })

    it('still asks after a save that failed, since the draft is still unsaved', async () => {
        const user = userEvent.setup()
        confirm.mockReturnValue(false)
        const server = priceServer()
        renderPrices()
        await tableLoaded()

        // The server has no answer for the write: it fails.
        await user.click(editButton(sonnetDated))
        await user.type(fieldOf(sonnetDated, 'Input'), '5')
        await user.click(
            within(formOf(sonnetDated)).getByRole('button', { name: 'Save' }),
        )
        await until(() => expect(priceWrites(server.fetchMock)).toHaveLength(1))
        await until(() => expect(fieldOf(sonnetDated, 'Input')).toBeEnabled())

        expect(closeTab()).toBe(true)

        await user.click(traces())

        expect(confirm).toHaveBeenCalledTimes(1)
    })
})
