import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp, appReady } from '@/test/render-app'
import { mockApi } from '@/test/traces-api'

// The Traces page asks for its list when a test navigates to it.
beforeEach(() => {
    mockApi()
})

const nav = () => screen.getByRole('navigation', { name: 'Main' })

describe('navigation', () => {
    it('has the five pages as links under the base path', () => {
        renderApp('/')

        const links = within(nav()).getAllByRole('link')

        expect(links.map((link) => link.textContent)).toEqual([
            'Overview',
            'Traces',
            'Conversations',
            'Agents',
            'Usage & cost',
        ])
        expect(links.map((link) => link.getAttribute('href'))).toEqual([
            '/trail',
            '/trail/traces',
            '/trail/conversations',
            '/trail/agents',
            '/trail/usage',
        ])
    })

    it('follows a custom base path', () => {
        renderApp('/traces', { path: '/ai/trail' })

        expect(
            within(nav())
                .getAllByRole('link')
                .map((link) => link.getAttribute('href')),
        ).toEqual([
            '/ai/trail',
            '/ai/trail/traces',
            '/ai/trail/conversations',
            '/ai/trail/agents',
            '/ai/trail/usage',
        ])
        expect(
            screen.getByRole('link', { name: 'Trail overview' }),
        ).toHaveAttribute('href', '/ai/trail')
    })

    it('marks exactly one item current, and a detail page marks its section', () => {
        renderApp('/traces/abc')

        const current = within(nav())
            .getAllByRole('link')
            .filter((link) => link.getAttribute('aria-current') === 'page')

        expect(current).toHaveLength(1)
        expect(current[0]).toHaveTextContent('Traces')
        expect(current[0]).toHaveAttribute('data-active', 'true')
    })

    it('marks the overview on the overview only', () => {
        renderApp('/')

        expect(
            within(nav()).getByRole('link', { name: 'Overview' }),
        ).toHaveAttribute('aria-current', 'page')
        expect(
            within(nav()).getByRole('link', { name: 'Traces' }),
        ).not.toHaveAttribute('aria-current')
    })

    it('marks nothing current on the not-found page', async () => {
        renderApp('/nowhere')
        await appReady()

        expect(
            screen.getByRole('heading', { level: 1, name: 'Page not found' }),
        ).toBeInTheDocument()
        expect(
            within(nav())
                .getAllByRole('link')
                .filter((link) => link.hasAttribute('aria-current')),
        ).toEqual([])
        expect(
            screen.getByRole('link', { name: 'Back to the overview' }),
        ).toHaveAttribute('href', '/trail')
    })

    it('goes to a page when its link is clicked', async () => {
        renderApp('/')

        await userEvent.click(
            within(nav()).getByRole('link', { name: 'Agents' }),
        )

        expect(
            screen.getByRole('heading', { level: 1, name: 'Agents' }),
        ).toBeInTheDocument()
        expect(
            within(nav()).getByRole('link', { name: 'Agents' }),
        ).toHaveAttribute('aria-current', 'page')
    })
})

describe('application block', () => {
    it('shows the application, its environment and the dashboard path', () => {
        renderApp('/')

        const sidebar = nav().closest('[data-slot="sidebar"]') as HTMLElement

        expect(within(sidebar).getByText('Acme Support')).toBeInTheDocument()
        expect(within(sidebar).getByText('Production')).toBeInTheDocument()
        expect(within(sidebar).getByText('/trail')).toBeInTheDocument()
    })

    it('names the application when the page does not', () => {
        renderApp('/', { appName: null })

        expect(
            within(screen.getByRole('banner')).getByText('Laravel application'),
        ).toBeInTheDocument()
        expect(
            screen.getAllByText('Laravel application').length,
        ).toBeGreaterThanOrEqual(2)
    })
})

describe('top bar', () => {
    it('shows the application and the trail to the page', () => {
        renderApp('/traces/abc')

        const crumbs = within(
            screen.getByRole('navigation', { name: 'breadcrumb' }),
        )

        expect(crumbs.getByText('Acme Support')).toBeInTheDocument()
        expect(crumbs.getByRole('link', { name: 'Traces' })).toHaveAttribute(
            'href',
            '/trail/traces',
        )
        expect(crumbs.getByText('Trace')).toHaveAttribute(
            'aria-current',
            'page',
        )
    })

    it('has a search control that is not wired up yet', () => {
        renderApp('/')

        expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
    })
})

describe('document title', () => {
    it.each([
        ['/', 'Overview · Trail'],
        ['/traces', 'Traces · Trail'],
        ['/traces/abc', 'Trace · Trail'],
        ['/conversations/c1', 'Conversation · Trail'],
        ['/agents/x', 'Agent · Trail'],
        ['/usage', 'Usage & cost · Trail'],
        ['/nowhere', 'Page not found · Trail'],
    ])('at %s is "%s"', (route, title) => {
        renderApp(route)

        expect(document.title).toBe(title)
    })

    it('changes with the page', async () => {
        renderApp('/')

        await userEvent.click(
            screen.getByRole('link', { name: 'Usage & cost' }),
        )

        expect(document.title).toBe('Usage & cost · Trail')
    })
})

describe('focus and scroll', () => {
    it('makes the skip link the first tab stop, pointing at the main region', async () => {
        renderApp('/')

        await userEvent.tab()

        const skip = screen.getByRole('link', { name: 'Skip to content' })

        expect(skip).toHaveFocus()
        expect(skip).toHaveAttribute('href', '#content')
        expect(screen.getByRole('main')).toHaveAttribute('id', 'content')
    })

    it('leaves focus alone on first load', () => {
        renderApp('/traces')

        expect(document.body).toHaveFocus()
        expect(vi.spyOn(window, 'scrollTo')).not.toHaveBeenCalled()
    })

    it('moves focus to the new heading and scrolls up after a page change', async () => {
        renderApp('/')
        await appReady()

        await userEvent.click(screen.getByRole('link', { name: 'Traces' }))

        expect(
            screen.getByRole('heading', { level: 1, name: 'Traces' }),
        ).toHaveFocus()
        expect(vi.spyOn(window, 'scrollTo')).toHaveBeenCalledWith(0, 0)
        expect(window.location.pathname).toBe('/trail/traces')
    })

    it('keeps the scroll position the browser restores on Back, but still focuses the heading', async () => {
        renderApp('/traces')
        await appReady()

        await userEvent.click(screen.getByRole('link', { name: 'Agents' }))
        await screen.findByRole('heading', { level: 1, name: 'Agents' })

        const scrollTo = vi.spyOn(window, 'scrollTo')

        scrollTo.mockClear()
        window.history.back()

        const heading = await screen.findByRole('heading', {
            level: 1,
            name: 'Traces',
        })

        await waitFor(() => expect(heading).toHaveFocus())
        expect(scrollTo).not.toHaveBeenCalled()
    })

    it('does not move focus when only the query string changes', () => {
        renderApp('/traces')

        act(() => {
            window.history.pushState({}, '', '/trail/traces?status=error')
            window.dispatchEvent(new PopStateEvent('popstate'))
        })

        expect(document.body).toHaveFocus()
    })
})

describe('sidebar shortcut', () => {
    it.each([{ metaKey: true }, { ctrlKey: true }])(
        'is ignored, with no cookie and the key left alone (%o)',
        (modifier) => {
            renderApp('/')
            document.cookie = 'sidebar_state=; max-age=0; path=/'

            const event = new KeyboardEvent('keydown', {
                key: 'b',
                bubbles: true,
                cancelable: true,
                ...modifier,
            })

            document.body.dispatchEvent(event)

            expect(document.cookie).not.toContain('sidebar_state')
            expect(event.defaultPrevented).toBe(false)
        },
    )
})

describe('base path', () => {
    it('matches a path with characters the browser percent-encodes', async () => {
        renderApp('/traces', { path: '/my trail/é' })
        await appReady()

        expect(
            screen.getByRole('heading', { level: 1, name: 'Traces' }),
        ).toBeInTheDocument()
        expect(
            within(nav())
                .getAllByRole('link')
                .map((link) => link.getAttribute('href'))[1],
        ).toBe('/my%20trail/%C3%A9/traces')
    })
})

describe('drawer', () => {
    beforeEach(() => {
        window.innerWidth = 500
    })

    afterEach(() => {
        window.innerWidth = 1024
    })

    const openDrawer = async () => {
        const trigger = screen.getByRole('button', { name: 'Open navigation' })

        await userEvent.click(trigger)

        return trigger
    }

    it('opens with the navigation, and Escape closes it and returns focus to the trigger', async () => {
        renderApp('/')

        expect(screen.queryByRole('link', { name: 'Traces' })).toBeNull()

        const trigger = await openDrawer()

        expect(trigger).toHaveAttribute('aria-expanded', 'true')
        expect(
            within(screen.getByRole('dialog')).getByRole('link', {
                name: 'Traces',
            }),
        ).toHaveAttribute('href', '/trail/traces')

        await userEvent.keyboard('{Escape}')

        expect(screen.queryByRole('dialog')).toBeNull()
        expect(trigger).toHaveAttribute('aria-expanded', 'false')
        expect(trigger).toHaveFocus()
    })

    it('closes when a link is followed, and focuses the new page', async () => {
        renderApp('/')
        await openDrawer()

        await userEvent.click(
            within(screen.getByRole('dialog')).getByRole('link', {
                name: 'Conversations',
            }),
        )

        expect(screen.queryByRole('dialog')).toBeNull()
        expect(
            screen.getByRole('heading', { level: 1, name: 'Conversations' }),
        ).toHaveFocus()
    })

    it('closes when the link to the page already open is followed', async () => {
        renderApp('/traces')
        await appReady()
        await openDrawer()

        await userEvent.click(
            within(screen.getByRole('dialog')).getByRole('link', {
                name: 'Traces',
            }),
        )

        expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('closes when the window grows to desktop width', async () => {
        const listeners = new Set<(event: { matches: boolean }) => void>()

        vi.stubGlobal('matchMedia', (query: string) => ({
            matches: false,
            media: query,
            addEventListener: (
                _: string,
                listener: (event: { matches: boolean }) => void,
            ) => listeners.add(listener),
            removeEventListener: () => {},
        }))
        renderApp('/')
        await appReady()
        await openDrawer()

        act(() => {
            window.innerWidth = 1200
            listeners.forEach((listener) => listener({ matches: false }))
        })

        expect(screen.queryByRole('dialog')).toBeNull()
    })
})
