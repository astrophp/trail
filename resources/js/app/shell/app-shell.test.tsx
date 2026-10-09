import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp, appReady } from '@/test/render-app'
import { mockApi } from '@/test/traces-api'

let broken = true

// The Usage page is the real one; its content is what cannot render, until `broken` is cleared.
vi.mock('@/features/usage', () => ({
    UsageView: () => {
        if (broken) {
            throw new Error('the page could not render')
        }

        return null
    },
}))

beforeEach(() => {
    broken = true
    // The page the person navigates to asks for its list.
    mockApi()
    // React logs the error the boundary catches.
    vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
    vi.restoreAllMocks()
})

const nav = () => screen.getByRole('navigation', { name: 'Main' })

describe('a page that throws', () => {
    it('leaves the sidebar and top bar usable and shows an error in the page', async () => {
        renderApp('/usage')
        await appReady()

        expect(screen.getByRole('alert')).toHaveTextContent(
            'This page could not be shown',
        )
        // The crash's own message stays out of the page.
        expect(screen.getByRole('alert')).not.toHaveTextContent(
            'the page could not render',
        )
        expect(
            within(nav()).getByRole('link', { name: 'Overview' }),
        ).toBeVisible()
        expect(screen.getByRole('banner')).toBeVisible()
    })

    it('does not reset when only the search parameters change', async () => {
        renderApp('/usage')
        await appReady()

        act(() => {
            window.history.pushState({}, '', '/trail/usage?x=1')
            window.dispatchEvent(new PopStateEvent('popstate'))
        })
        broken = false

        await waitFor(() => expect(window.location.search).toBe('?x=1'))
        expect(screen.getByRole('alert')).toBeVisible()
    })

    it('recovers when the person navigates away', async () => {
        renderApp('/usage')

        await userEvent.click(
            within(nav()).getByRole('link', { name: 'Traces' }),
        )

        expect(
            await screen.findByRole('heading', {
                level: 1,
                name: 'Traces',
            }),
        ).toBeVisible()
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        // The shell still hands focus to the new page's heading.
        expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
        expect(document.title).toContain('Traces')
    })

    it('tries the page again, and focuses the recovered page’s heading', async () => {
        renderApp('/usage')
        await appReady()
        broken = false

        await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

        const heading = await screen.findByRole('heading', {
            level: 1,
            name: 'Usage & cost',
        })

        expect(heading).toHaveFocus()
    })
})
