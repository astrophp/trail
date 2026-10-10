import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { notify } from '@/components/patterns/notify'
import { appReady, renderApp } from '@/test/render-app'
import { stubResizeObserver } from '@/test/resize-observer'
import { until } from '@/test/wait'
import {
    advance,
    chord,
    clock,
    json,
    mockSearch,
    optionNames,
    palette,
    queryPalette,
    searchFor,
    searchRow,
    status,
} from '@/test/palette-api'
import { loaded, searchBox } from '@/test/traces-api'

beforeEach(() => {
    stubResizeObserver()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockSearch((url) =>
        json(searchFor(new URL(url, 'http://x').searchParams.get('q') ?? '')),
    )
})

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    document.documentElement.classList.remove('dark')
    window.localStorage.clear()
})

const onPlatform = (platform: string) =>
    vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue(platform)

const trigger = () => screen.getByRole('button', { name: 'Search' })

describe('opening and closing', () => {
    it('opens on Ctrl K, as a dialog with a name and a description, focus in the search row', async () => {
        const user = clock()
        renderApp('/')
        await appReady()

        expect(queryPalette()).not.toBeInTheDocument()

        await user.keyboard(chord)

        expect(palette()).toHaveAccessibleDescription(
            'Go to a page, run an action, or find a run, a conversation or an agent.',
        )
        expect(searchRow()).toHaveFocus()
        expect(searchRow()).toHaveAttribute(
            'placeholder',
            'Search runs, conversations and agents…',
        )
    })

    it('closes on the same key, and on Escape', async () => {
        const user = clock()
        renderApp('/')
        await appReady()

        await user.keyboard(chord)
        expect(palette()).toBeInTheDocument()
        await user.keyboard(chord)
        expect(queryPalette()).not.toBeInTheDocument()

        await user.keyboard(chord)
        expect(palette()).toBeInTheDocument()
        await user.keyboard('{Escape}')
        expect(queryPalette()).not.toBeInTheDocument()
    })

    it('opens on Command K on an Apple platform, and not on Ctrl K there', async () => {
        onPlatform('MacIntel')
        const user = clock()
        renderApp('/')
        await appReady()

        await user.keyboard(chord)
        expect(queryPalette()).not.toBeInTheDocument()

        await user.keyboard('{Meta>}k{/Meta}')
        expect(palette()).toBeInTheDocument()
        await user.keyboard('{Meta>}k{/Meta}')
        expect(queryPalette()).not.toBeInTheDocument()
    })

    it('opens from the button in the top bar, and Escape returns focus to it', async () => {
        const user = clock()
        renderApp('/')
        await appReady()

        const button = trigger()

        await user.click(button)

        expect(palette()).toBeInTheDocument()
        expect(button).toHaveAttribute('aria-haspopup', 'dialog')

        await user.keyboard('{Escape}')
        await advance(50)

        expect(queryPalette()).not.toBeInTheDocument()
        expect(button).toHaveFocus()
    })

    it('writes the shortcut on the button as the platform names it', async () => {
        renderApp('/')
        await appReady()

        expect(within(trigger()).getByText('Ctrl K')).toBeInTheDocument()
        expect(within(trigger()).queryByText('⌘K')).not.toBeInTheDocument()
        expect(trigger()).toHaveAttribute('aria-keyshortcuts', 'Control+K')
    })

    it('writes ⌘K on the button on an Apple platform', async () => {
        onPlatform('MacIntel')
        renderApp('/')
        await appReady()

        expect(within(trigger()).getByText('⌘K')).toBeInTheDocument()
        expect(within(trigger()).queryByText('Ctrl K')).not.toBeInTheDocument()
        expect(trigger()).toHaveAttribute('aria-keyshortcuts', 'Meta+K')
    })

    it('does not open on top of another dialog, and opens once that one is gone', async () => {
        const user = clock()
        renderApp('/')
        await appReady()
        const other = document.createElement('div')
        other.setAttribute('role', 'dialog')
        other.setAttribute('aria-label', 'Something else')
        document.body.append(other)

        await user.keyboard(chord)

        expect(queryPalette()).not.toBeInTheDocument()
        expect(
            screen.getByRole('dialog', { name: 'Something else' }),
        ).toBeInTheDocument()

        other.remove()
        await user.keyboard(chord)

        expect(palette()).toBeInTheDocument()
    })

    it('does not open over an open menu, and opens once it is closed', async () => {
        const user = clock()
        renderApp('/')
        await appReady()

        await user.click(screen.getByRole('button', { name: /^Theme:/ }))
        expect(screen.getByRole('menu')).toBeInTheDocument()
        await user.keyboard(chord)

        expect(queryPalette()).not.toBeInTheDocument()

        await user.keyboard('{Escape}')
        await advance(50)
        await user.keyboard(chord)

        expect(palette()).toBeInTheDocument()
    })

    it('opens while focus is in a field, and Escape puts focus back there', async () => {
        const user = clock()
        renderApp('/traces')
        await loaded()

        await user.click(searchBox())
        await user.keyboard(chord)

        expect(palette()).toBeInTheDocument()

        await user.keyboard('{Escape}')
        await advance(50)

        expect(searchBox()).toHaveFocus()
    })

    it('puts focus back on the control of the page that had it', async () => {
        const user = clock()
        renderApp('/')
        await appReady()
        const link = within(
            screen.getByRole('navigation', { name: 'Main' }),
        ).getByRole('link', { name: 'Traces' })
        link.focus()

        await user.keyboard(chord)
        expect(searchRow()).toHaveFocus()
        await user.keyboard('{Escape}')
        await advance(50)

        expect(link).toHaveFocus()
    })

    it('is not navigation: the address stays and the page is not remounted', async () => {
        const user = clock()
        renderApp('/agents?range=7d')
        await screen.findByRole('heading', { level: 1, name: 'Agents' })
        const heading = screen.getByRole('heading', {
            level: 1,
            name: 'Agents',
        })
        const address = window.location.href
        const entries = window.history.length

        await user.keyboard(chord)
        await user.keyboard('{Escape}')

        expect(window.location.href).toBe(address)
        expect(window.history.length).toBe(entries)
        expect(screen.getByRole('heading', { level: 1, name: 'Agents' })).toBe(
            heading,
        )
    })

    it('forgets the text when it closes', async () => {
        const user = clock()
        renderApp('/')
        await appReady()

        await user.keyboard(chord)
        await user.type(searchRow(), 'o')
        expect(searchRow()).toHaveValue('o')
        await user.keyboard('{Escape}')
        await user.keyboard(chord)

        expect(searchRow()).toHaveValue('')
    })
})

describe('the pages and the actions', () => {
    it('lists the five pages with the sidebar’s names, then the two actions, before anything is typed', async () => {
        const user = clock()
        const fetchMock = mockSearch(() => json(searchFor('')))
        renderApp('/')
        await appReady()

        await user.keyboard(chord)

        expect(optionNames()).toEqual([
            'OverviewPage',
            'TracesPage',
            'ConversationsPage',
            'AgentsPage',
            'Usage & costPage',
            'Toggle themeAction',
            'Copy link to this pageAction',
        ])
        expect(
            within(palette())
                .getAllByRole('link')
                .map((link) => link.getAttribute('href')),
        ).toEqual([
            '/trail',
            '/trail/traces',
            '/trail/conversations',
            '/trail/agents',
            '/trail/usage',
        ])
        expect(fetchMock.searches()).toHaveLength(0)
    })

    it('filters the pages as you type', async () => {
        const user = clock()
        renderApp('/')
        await appReady()

        await user.keyboard(chord)
        await user.type(searchRow(), 'trac')

        expect(optionNames()).toEqual(['TracesPage'])
    })

    it('filters the actions the same way', async () => {
        const user = clock()
        renderApp('/')
        await appReady()

        await user.keyboard(chord)
        await user.type(searchRow(), 'THEME')

        expect(optionNames()).toEqual(['Toggle themeAction'])

        await user.clear(searchRow())
        await user.type(searchRow(), 'copy')

        expect(optionNames()).toEqual(['Copy link to this pageAction'])
    })

    it('makes no request for a text shorter than two characters, and says so', async () => {
        const user = clock()
        const fetchMock = mockSearch(() => json(searchFor('a')))
        renderApp('/')
        await appReady()

        await user.keyboard(chord)
        await user.type(searchRow(), 'a')
        await advance(1000)

        expect(fetchMock.searches()).toHaveLength(0)
        expect(optionNames()).toContain('AgentsPage')
        expect(status()).toHaveTextContent(
            'Type at least 2 characters to search runs, conversations and agents.',
        )
    })

    it('toggles the theme and closes', async () => {
        const user = clock()
        renderApp('/')
        await appReady()
        expect(document.documentElement).not.toHaveClass('dark')

        await user.keyboard(chord)
        await user.click(screen.getByRole('option', { name: /^Toggle theme/ }))

        expect(document.documentElement).toHaveClass('dark')
        expect(queryPalette()).not.toBeInTheDocument()

        await user.keyboard(chord)
        await user.click(screen.getByRole('option', { name: /^Toggle theme/ }))

        expect(document.documentElement).not.toHaveClass('dark')
    })

    it('copies the link to the page it was opened on, says so, and closes', async () => {
        const user = clock()
        const writeText = vi.fn(() => Promise.resolve())
        vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
        const success = vi.spyOn(notify, 'success')
        renderApp('/traces?range=7d')
        await loaded()

        await user.keyboard(chord)
        // Not user-event: it installs a clipboard of its own on `navigator`, hiding the stub under test.
        await act(async () => {
            fireEvent.click(
                screen.getByRole('option', { name: /^Copy link to this page/ }),
            )
            await Promise.resolve()
        })

        expect(writeText).toHaveBeenCalledTimes(1)
        expect(writeText).toHaveBeenCalledWith(
            `${window.location.origin}/trail/traces?range=7d`,
        )
        expect(success).toHaveBeenCalledWith('Link copied.')
        expect(queryPalette()).not.toBeInTheDocument()
    })
})

describe('choosing a page', () => {
    it('selects the first option, and exposes the active one on the search row', async () => {
        const user = clock()
        renderApp('/')
        await appReady()

        await user.keyboard(chord)

        const [first] = within(palette()).getAllByRole('option')

        expect(first).toHaveAttribute('aria-selected', 'true')
        await until(() =>
            expect(searchRow()).toHaveAttribute(
                'aria-activedescendant',
                first.id,
            ),
        )
        expect(
            within(palette())
                .getAllByRole('option')
                .filter(
                    (option) => option.getAttribute('aria-selected') === 'true',
                ),
        ).toHaveLength(1)
    })

    it('goes down twice and Enter opens the third page, then focus is on its heading', async () => {
        const user = clock()
        renderApp('/')
        await appReady()

        await user.keyboard(chord)
        await user.keyboard('{ArrowDown}{ArrowDown}')

        const active = within(palette())
            .getAllByRole('option')
            .find((option) => option.getAttribute('aria-selected') === 'true')

        expect(active).toHaveTextContent('Conversations')
        expect(searchRow()).toHaveAttribute('aria-activedescendant', active!.id)

        await user.keyboard('{Enter}')

        expect(window.location.pathname).toBe('/trail/conversations')
        expect(queryPalette()).not.toBeInTheDocument()
        expect(
            await screen.findByRole('heading', {
                level: 1,
                name: 'Conversations',
            }),
        ).toHaveFocus()
    })

    it('follows the link of a click, closes, and leaves focus to the new page’s heading', async () => {
        const user = clock()
        renderApp('/')
        await appReady()

        await user.keyboard(chord)
        await user.click(
            within(palette()).getByRole('link', { name: /^Agents/ }),
        )

        expect(window.location.pathname).toBe('/trail/agents')
        expect(queryPalette()).not.toBeInTheDocument()
        expect(
            await screen.findByRole('heading', { level: 1, name: 'Agents' }),
        ).toHaveFocus()
    })

    it('opens the active page in a new tab on Ctrl+Enter, and stays where it is', async () => {
        const user = clock()
        const open = vi.spyOn(window, 'open').mockReturnValue(null)
        renderApp('/')
        await appReady()

        await user.keyboard(chord)
        await user.keyboard('{ArrowDown}{Control>}{Enter}{/Control}')

        expect(open).toHaveBeenCalledTimes(1)
        expect(open).toHaveBeenCalledWith(
            `${window.location.origin}/trail/traces`,
            '_blank',
            'noopener',
        )
        expect(window.location.pathname).toBe('/trail/')
        expect(palette()).toBeInTheDocument()
    })

    it('goes to the second page after one arrow, not the first', async () => {
        const user = clock()
        renderApp('/usage')
        await appReady()

        await user.keyboard(chord)
        await user.keyboard('{ArrowDown}{Enter}')

        expect(window.location.pathname).toBe('/trail/traces')
    })
})
