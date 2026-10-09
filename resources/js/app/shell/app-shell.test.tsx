import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp, appReady } from '@/test/render-app'

let broken = true

vi.mock('@/pages/placeholder-page', () => ({
    PlaceholderPage: ({ title }: { title: string }) => {
        if (title === 'Agents' && broken) {
            throw new Error('the page could not render')
        }

        return <h1 tabIndex={-1}>{title}</h1>
    },
}))

beforeEach(() => {
    broken = true
    // React logs the error the boundary catches.
    vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
    vi.restoreAllMocks()
})

const nav = () => screen.getByRole('navigation', { name: 'Main' })

describe('a page that throws', () => {
    it('leaves the sidebar and top bar usable and shows an error in the page', async () => {
        renderApp('/agents')
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
        renderApp('/agents')
        await appReady()

        act(() => {
            window.history.pushState({}, '', '/trail/agents?x=1')
            window.dispatchEvent(new PopStateEvent('popstate'))
        })
        broken = false

        await waitFor(() => expect(window.location.search).toBe('?x=1'))
        expect(screen.getByRole('alert')).toBeVisible()
    })

    it('recovers when the person navigates away', async () => {
        renderApp('/agents')

        await userEvent.click(
            within(nav()).getByRole('link', { name: 'Usage & cost' }),
        )

        expect(
            await screen.findByRole('heading', {
                level: 1,
                name: 'Usage & cost',
            }),
        ).toBeVisible()
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        // The shell still hands focus to the new page's heading.
        expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
        expect(document.title).toContain('Usage & cost')
    })

    it('tries the page again, and focuses the recovered page’s heading', async () => {
        renderApp('/agents')
        await appReady()
        broken = false

        await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

        const heading = await screen.findByRole('heading', {
            level: 1,
            name: 'Agents',
        })

        expect(heading).toHaveFocus()
    })
})
