import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { navPages, type Section } from '@/lib/nav-pages'
import { conversationPath } from '@/lib/conversation-path'
import {
    ariaKeyShortcuts,
    shortcut,
    shortcuts,
    type ShortcutId,
} from '@/lib/shortcuts'
import { serveApp } from '@/test/app-server'
import { chord, palette, queryPalette } from '@/test/palette-api'
import { appReady, renderApp } from '@/test/render-app'
import { stubResizeObserver } from '@/test/resize-observer'
import { until } from '@/test/wait'

beforeEach(() => {
    // The palette's list measures itself.
    stubResizeObserver()
})

afterEach(() => {
    vi.restoreAllMocks()
})

const here = () => `${window.location.pathname}${window.location.search}`
const pageOf = (url: string) =>
    Number(new URL(url, 'http://x').searchParams.get('page') ?? 1)
const pageParam = () =>
    new URLSearchParams(window.location.search).get('page') ?? '1'

/** The links a key can focus: one per row that leads somewhere. */
const rowLinks = () => [
    ...document.querySelectorAll<HTMLAnchorElement>(
        'tbody a[data-slot="row-link"]',
    ),
]
const addressOf = (link: HTMLAnchorElement) => {
    const url = new URL(link.href)

    return `${url.pathname}${url.search}`
}
/** The table the rows are in: a page may hold more than one. */
const tableOfRows = () => rowLinks()[0].closest('table') as HTMLElement
const helpDialog = () =>
    screen.getByRole('dialog', { name: 'Keyboard shortcuts' })
const queryHelp = () =>
    screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })

/** One page of the dashboard that is a list: where it is, what its search field is called. */
type ListPage = {
    name: string
    route: string
    search: string | null
}

const listPages: ListPage[] = [
    { name: 'Traces', route: '/traces', search: 'Search runs' },
    {
        name: 'Conversations',
        route: '/conversations',
        search: 'Search conversations',
    },
    { name: 'Agents', route: '/agents', search: 'Search agents' },
    { name: 'Usage', route: '/usage', search: null },
]

async function openList({ route }: ListPage, on = 1) {
    renderApp(on === 1 ? route : `${route}?page=${on}`)
    await appReady()
    await until(() => expect(rowLinks().length).toBeGreaterThan(1))
    await screen.findByText(`Page ${on} of 3`)
}

const goTo = (section: Section) => async () => {
    serveApp()
    // The page left is never the target, and has a range and a page in its address.
    renderApp(
        section === 'traces' ? '/agents?range=7d' : '/traces?range=7d&page=2',
    )
    await appReady()

    const { title } = navPages.find((page) => page.section === section)!
    const link = within(
        screen.getByRole('navigation', { name: 'Main' }),
    ).getByRole('link', { name: title })
    const target = new URL((link as HTMLAnchorElement).href)

    await userEvent.keyboard(shortcut(`go-${section}`).keys.join(''))

    // Where the sidebar's link goes, the range included: it is not carried over.
    expect(here()).toBe(`${target.pathname}${target.search}`)
    expect(window.location.search).toBe('')
}

/** A run reached from a list view, with a neighbour on each side. */
const view = '/traces?range=7d&status=failed&page=2'
const fromRun = `/traces/run-b?${new URLSearchParams({ from: view }).toString()}`

async function openRun() {
    serveApp({
        neighbours: {
            'run-b': { previous: 'run-a', next: 'run-c' },
            'run-a': { previous: null, next: 'run-b' },
        },
    })
    renderApp(fromRun)
    await appReady()
    await screen.findByRole('tree', { name: 'Execution tree' })
    await until(() =>
        expect(screen.getByLabelText('Next trace')).not.toHaveAttribute(
            'aria-disabled',
            'true',
        ),
    )
}

/** What each shortcut of the table is proved by: a new entry in the table needs a proof here to compile. */
const proofs: Record<ShortcutId, () => Promise<void>> = {
    help: async () => {
        serveApp()
        renderApp('/')
        await appReady()

        expect(queryHelp()).not.toBeInTheDocument()

        await userEvent.keyboard('?')

        expect(helpDialog()).toBeInTheDocument()

        await userEvent.keyboard('?')
        await until(() => expect(queryHelp()).not.toBeInTheDocument())
    },
    palette: async () => {
        serveApp()
        renderApp('/')
        await appReady()

        expect(queryPalette()).not.toBeInTheDocument()

        await userEvent.keyboard(chord)

        expect(palette()).toBeInTheDocument()

        await userEvent.keyboard(chord)
        await until(() => expect(queryPalette()).not.toBeInTheDocument())
    },
    ...(Object.fromEntries(
        navPages.map(({ section }) => [`go-${section}`, goTo(section)]),
    ) as Record<`go-${Section}`, () => Promise<void>>),
    search: async () => {
        serveApp()
        await openList(listPages[0])

        await userEvent.keyboard('/')

        expect(
            screen.getByRole('searchbox', { name: 'Search runs' }),
        ).toHaveFocus()
        // The slash took focus; it was not typed.
        expect(
            screen.getByRole('searchbox', { name: 'Search runs' }),
        ).toHaveValue('')
    },
    'row-next': async () => {
        serveApp()
        await openList(listPages[0])

        await userEvent.keyboard('j')

        expect(document.activeElement).toBe(rowLinks()[0])
    },
    'row-previous': async () => {
        serveApp()
        await openList(listPages[0])

        await userEvent.keyboard('jjk')

        expect(document.activeElement).toBe(rowLinks()[0])
    },
    'row-open': async () => {
        serveApp()
        await openList(listPages[0])

        await userEvent.keyboard('jj')
        const second = rowLinks()[1]
        await userEvent.keyboard('{Enter}')

        expect(here()).toBe(addressOf(second))
        expect(window.location.pathname).toMatch(/^\/trail\/traces\/./)
    },
    'page-next': async () => {
        serveApp()
        await openList(listPages[0])

        await userEvent.keyboard(']')

        await until(() => expect(pageParam()).toBe('2'))
    },
    'page-previous': async () => {
        serveApp()
        await openList(listPages[0], 2)

        await userEvent.keyboard('[[')

        await until(() => expect(pageParam()).toBe('1'))
    },
    'trace-next': async () => {
        await openRun()

        await userEvent.keyboard('j')

        expect(window.location.pathname).toBe('/trail/traces/run-c')
    },
    'trace-previous': async () => {
        await openRun()

        await userEvent.keyboard('k')

        expect(window.location.pathname).toBe('/trail/traces/run-a')
    },
    'trace-back': async () => {
        await openRun()

        await userEvent.keyboard('gb')

        // The place the run was opened from, with its view: where the back links go.
        expect(here()).toBe(`/trail${view}`)
    },
    'conversation-back': async () => {
        serveApp()
        renderApp(conversationPath('support/ada 1042'))
        await appReady()
        await screen.findAllByRole('article', { name: /^Turn / })

        await userEvent.keyboard('gb')

        expect(here()).toBe('/trail/conversations')
    },
}

describe('every shortcut of the table does what its label says', () => {
    it('has a proof for exactly the shortcuts of the table', () => {
        expect(Object.keys(proofs).sort()).toEqual(
            shortcuts.map((entry) => entry.id).sort(),
        )
    })

    it.each(shortcuts.map((entry) => [entry.id, entry.label] as const))(
        '%s: %s',
        async (id) => {
            await proofs[id]()
        },
    )
})

describe.each(listPages)('the keys of the $name page', (page) => {
    it('moves real focus to the rows with j and k, and stops at the first and the last', async () => {
        serveApp()
        await openList(page)
        const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
        const links = rowLinks()

        // Nothing is focused yet: k has nowhere to go.
        await userEvent.keyboard('k')

        expect(links).not.toContain(document.activeElement)

        await userEvent.keyboard('j')

        expect(document.activeElement).toBe(links[0])
        expect(scroll.mock.contexts.at(-1)).toBe(links[0])
        expect(scroll).toHaveBeenLastCalledWith({ block: 'nearest' })

        await userEvent.keyboard('j')

        expect(document.activeElement).toBe(links[1])

        await userEvent.keyboard('k')

        expect(document.activeElement).toBe(links[0])

        // The first row: k does nothing, it does not wrap.
        await userEvent.keyboard('k')

        expect(document.activeElement).toBe(links[0])

        await userEvent.keyboard('j'.repeat(links.length + 3))

        expect(document.activeElement).toBe(links.at(-1))

        // The last row: j does nothing, it does not wrap, and it does not turn the page.
        await userEvent.keyboard('j')

        expect(document.activeElement).toBe(links.at(-1))
        expect(pageParam()).toBe('1')
    })

    it('opens the row that has focus with Enter', async () => {
        serveApp()
        await openList(page)

        await userEvent.keyboard('jj')
        const focused = document.activeElement as HTMLAnchorElement

        expect(focused).toBe(rowLinks()[1])

        await userEvent.keyboard('{Enter}')

        expect(here()).toBe(addressOf(focused))
        expect(here()).not.toBe(`/trail${page.route}`)
    })

    it('goes through the pages with ] and [, and stops at the ends', async () => {
        serveApp()
        await openList(page)

        await userEvent.keyboard('[[')
        expect(pageParam()).toBe('1')

        await userEvent.keyboard(']')
        await until(() => expect(pageParam()).toBe('2'))
        await screen.findByText(/^Page 2 of 3$/)

        await userEvent.keyboard(']')
        await until(() => expect(pageParam()).toBe('3'))
        await screen.findByText(/^Page 3 of 3$/)

        // The last page: ] does nothing.
        await userEvent.keyboard(']')
        expect(pageParam()).toBe('3')

        await userEvent.keyboard('[[')
        await until(() => expect(pageParam()).toBe('2'))
        await screen.findByText(/^Page 2 of 3$/)

        await userEvent.keyboard('[[')
        await until(() => expect(pageParam()).toBe('1'))
        await screen.findByText(/^Page 1 of 3$/)

        // The first page: [ does nothing.
        await userEvent.keyboard('[[')
        expect(pageParam()).toBe('1')
    })

    it('does not move focus or turn the page while the rows on screen are the previous view’s', async () => {
        let release: () => void = () => {}
        const gate = new Promise<void>((done) => {
            release = done
        })
        serveApp({
            hold: (url) => (pageOf(url) === 3 ? gate : undefined),
        })
        await openList(page, 2)
        const links = rowLinks()

        await userEvent.keyboard('j]')

        // Page 3 is on its way; the table shows page 2 dimmed and says it is busy.
        await until(() =>
            expect(tableOfRows()).toHaveAttribute('aria-busy', 'true'),
        )
        expect(pageParam()).toBe('3')
        expect(document.activeElement).toBe(links[0])

        // Acting on page 2's rows or page count would move focus, or go to page 1 from page 2.
        await userEvent.keyboard('j[[')

        expect(document.activeElement).toBe(links[0])
        expect(pageParam()).toBe('3')

        // Control: once the answer is in, the same keys act.
        release()
        await screen.findByText('Page 3 of 3')
        await until(() =>
            expect(tableOfRows()).not.toHaveAttribute('aria-busy'),
        )
        // Focus may have stayed on a row of the page that was replaced: start again from none.
        ;(document.activeElement as HTMLElement).blur()
        await userEvent.keyboard('j')

        expect(document.activeElement).toBe(rowLinks()[0])

        await userEvent.keyboard('[[')
        await until(() => expect(pageParam()).toBe('2'))
    })

    if (page.search !== null) {
        const name = page.search

        it('focuses the search field with /, and leaves / to the field once it is there', async () => {
            serveApp()
            await openList(page)
            const field = screen.getByRole('searchbox', { name })

            await userEvent.keyboard('/')

            expect(field).toHaveFocus()
            expect(field).toHaveValue('')

            // Typing in the field: / is a character, and focus stays where it is.
            await userEvent.keyboard('a/b')

            expect(field).toHaveFocus()
            expect(field).toHaveValue('a/b')
        })

        it('shows the key in the empty search field and exposes it', async () => {
            serveApp()
            await openList(page)

            expect(screen.getByRole('searchbox', { name })).toHaveAttribute(
                'aria-keyshortcuts',
                ariaKeyShortcuts('search'),
            )
        })
    } else {
        it('has no search field for / to focus', async () => {
            serveApp()
            await openList(page)

            await userEvent.keyboard('/')

            expect(document.activeElement).toBe(document.body)
        })
    }

    it('exposes the paging keys on the buttons', async () => {
        serveApp()
        await openList(page)

        expect(
            screen.getByRole('button', { name: 'Previous page' }),
        ).toHaveAttribute(
            'aria-keyshortcuts',
            ariaKeyShortcuts('page-previous'),
        )
        expect(
            screen.getByRole('button', { name: 'Next page' }),
        ).toHaveAttribute('aria-keyshortcuts', ariaKeyShortcuts('page-next'))
    })
})

describe('the rules that hold for every shortcut, on a real page', () => {
    it('do not fire in the search field, with a modifier held, or under the palette', async () => {
        serveApp()
        await openList(listPages[0])
        const field = screen.getByRole('searchbox', { name: 'Search runs' })

        await userEvent.click(field)
        await userEvent.keyboard('j]?')

        expect(field).toHaveValue('j]?')
        expect(document.activeElement).toBe(field)
        expect(queryHelp()).not.toBeInTheDocument()
        expect(pageParam()).toBe('1')

        await userEvent.click(document.body)
        await userEvent.keyboard('{Control>}j{/Control}{Alt>}]{/Alt}')

        expect(document.activeElement).toBe(document.body)
        expect(pageParam()).toBe('1')

        // Control: with focus on the page the same keys act.
        await userEvent.keyboard('j')

        expect(document.activeElement).toBe(rowLinks()[0])

        await userEvent.keyboard(chord)
        await userEvent.keyboard('{Escape}')
        await until(() => expect(queryPalette()).not.toBeInTheDocument())
    })

    it('leave the palette’s search to the palette', async () => {
        serveApp()
        await openList(listPages[0])

        await userEvent.keyboard(chord)
        await userEvent.keyboard('j?]')

        expect(queryHelp()).not.toBeInTheDocument()
        expect(pageParam()).toBe('1')
        expect(
            within(palette()).getByRole('combobox', {
                name: 'Search runs, conversations and agents',
            }),
        ).toHaveValue('j?]')
    })

    it('lets the sequence be abandoned by a key of the page without it acting', async () => {
        serveApp()
        await openList(listPages[0])

        await userEvent.keyboard('gj')

        expect(window.location.pathname).toBe('/trail/traces')
        expect(document.activeElement).toBe(document.body)

        // Control: j alone moves to the first row.
        await userEvent.keyboard('j')

        expect(document.activeElement).toBe(rowLinks()[0])
    })
})

describe('aria-keyshortcuts, written from the table', () => {
    it('is on the palette button and the step buttons, and not on a link a sequence reaches', async () => {
        await openRun()

        expect(screen.getByRole('button', { name: 'Search' })).toHaveAttribute(
            'aria-keyshortcuts',
            ariaKeyShortcuts('palette'),
        )
        expect(screen.getByLabelText('Previous trace')).toHaveAttribute(
            'aria-keyshortcuts',
            ariaKeyShortcuts('trace-previous'),
        )
        expect(screen.getByLabelText('Next trace')).toHaveAttribute(
            'aria-keyshortcuts',
            ariaKeyShortcuts('trace-next'),
        )

        for (const link of within(
            screen.getByRole('navigation', { name: 'Main' }),
        ).getAllByRole('link')) {
            expect(link).not.toHaveAttribute('aria-keyshortcuts')
        }
    })

    it('says Control+K where the modifier is Control', async () => {
        serveApp()
        renderApp('/')
        await appReady()

        expect(screen.getByRole('button', { name: 'Search' })).toHaveAttribute(
            'aria-keyshortcuts',
            'Control+K',
        )
    })

    it('says Meta+K on an Apple platform', async () => {
        vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue(
            'MacIntel',
        )
        serveApp()
        renderApp('/')
        await appReady()

        expect(screen.getByRole('button', { name: 'Search' })).toHaveAttribute(
            'aria-keyshortcuts',
            'Meta+K',
        )
    })
})
