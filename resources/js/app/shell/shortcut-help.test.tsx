import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { conversationPath } from '@/lib/conversation-path'
import { chordLabel, scopeHeadings, shortcuts } from '@/lib/shortcuts'
import { serveApp } from '@/test/app-server'
import { chord, palette, queryPalette } from '@/test/palette-api'
import { appReady, renderApp } from '@/test/render-app'
import { stubResizeObserver } from '@/test/resize-observer'
import { until } from '@/test/wait'

beforeEach(() => {
    stubResizeObserver()
    serveApp()
})

afterEach(() => {
    vi.restoreAllMocks()
})

const help = () => screen.getByRole('dialog', { name: 'Keyboard shortcuts' })
const queryHelp = () =>
    screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })
const rows = () => [...help().querySelectorAll<HTMLElement>('[data-shortcut]')]
const headings = () =>
    within(help())
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.firstChild?.textContent)
const applying = () =>
    within(help())
        .getAllByRole('heading', { level: 3 })
        .filter((heading) =>
            heading.querySelector('[data-slot=shortcut-applies]'),
        )
        .map((heading) => heading.firstChild?.textContent)

async function openOn(route: string) {
    renderApp(route)
    await appReady()
    await userEvent.keyboard('?')
}

describe('the keyboard shortcuts help', () => {
    it('lists exactly the table: the same ids, in the same number, with the table’s labels', async () => {
        await openOn('/traces')

        expect(rows().map((row) => row.dataset.shortcut)).toHaveLength(
            shortcuts.length,
        )
        expect(
            rows()
                .map((row) => row.dataset.shortcut)
                .sort(),
        ).toEqual(shortcuts.map((entry) => entry.id).sort())

        for (const entry of shortcuts) {
            const row = help().querySelector<HTMLElement>(
                `[data-shortcut="${entry.id}"]`,
            ) as HTMLElement

            expect(row).toHaveTextContent(entry.label)
            expect(
                [...row.querySelectorAll('kbd[data-slot=kbd]')].map(
                    (key) => key.textContent,
                ),
            ).toEqual(entry.keys.map((keys) => chordLabel(keys, false)))
        }
    })

    it('puts each shortcut in the group of its scope and names the groups', async () => {
        await openOn('/traces')

        for (const entry of shortcuts) {
            const group = help()
                .querySelector(`[data-shortcut="${entry.id}"]`)
                ?.closest('[role=group]')

            expect(group).toHaveAccessibleName(
                new RegExp(`^${scopeHeadings[entry.scope]}`),
            )
        }
    })

    it.each([
        [
            'a list page',
            '/traces',
            ['Lists', 'Everywhere', 'Run page', 'Conversation page'],
            ['Lists', 'Everywhere'],
        ],
        [
            'the page of a run',
            '/traces/run-a',
            ['Run page', 'Everywhere', 'Lists', 'Conversation page'],
            ['Run page', 'Everywhere'],
        ],
        [
            'the page of a conversation',
            conversationPath('support/ada 1042'),
            ['Conversation page', 'Everywhere', 'Lists', 'Run page'],
            ['Conversation page', 'Everywhere'],
        ],
        [
            'a page with no shortcuts of its own',
            '/',
            ['Everywhere', 'Lists', 'Run page', 'Conversation page'],
            ['Everywhere'],
        ],
    ])(
        'puts the scopes of %s first and marks them',
        async (_page, route, order, marked) => {
            await openOn(route)

            expect(headings()).toEqual(order)
            expect(applying()).toEqual(marked)
        },
    )

    it('writes ⌘ on an Apple platform and Ctrl elsewhere', async () => {
        await openOn('/')

        const keys = () =>
            [
                ...help()
                    .querySelector('[data-shortcut=palette]')!
                    .querySelectorAll('kbd[data-slot=kbd]'),
            ].map((key) => key.textContent)

        expect(keys()).toEqual(['Ctrl K'])
    })

    it('writes ⌘ on an Apple platform', async () => {
        vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue(
            'MacIntel',
        )
        await openOn('/')

        expect(
            help().querySelector('[data-shortcut=palette]'),
        ).toHaveTextContent('⌘K')
    })

    it('shows a sequence as its two keys with a word between', async () => {
        await openOn('/')

        const row = help().querySelector(
            '[data-shortcut=go-traces]',
        ) as HTMLElement

        expect(row).toHaveTextContent('Go to Tracesgthent')
    })

    it('opens on ?, closes on ? and on Escape, and changes no address', async () => {
        renderApp('/traces?range=7d')
        await appReady()
        const where = window.location.href

        expect(queryHelp()).not.toBeInTheDocument()

        await userEvent.keyboard('?')

        expect(help()).toBeInTheDocument()
        expect(window.location.href).toBe(where)

        await userEvent.keyboard('?')
        await until(() => expect(queryHelp()).not.toBeInTheDocument())

        await userEvent.keyboard('?')
        await userEvent.keyboard('{Escape}')
        await until(() => expect(queryHelp()).not.toBeInTheDocument())
        expect(window.location.href).toBe(where)
    })

    it('has a Close button', async () => {
        await openOn('/')

        await userEvent.click(
            within(help()).getByRole('button', { name: 'Close' }),
        )
        await until(() => expect(queryHelp()).not.toBeInTheDocument())
    })

    it('does not open while the person types, and does once they stop', async () => {
        renderApp('/traces')
        await appReady()
        const field = await screen.findByRole('searchbox', {
            name: 'Search runs',
        })

        await userEvent.click(field)
        await userEvent.keyboard('?')

        expect(field).toHaveValue('?')
        expect(queryHelp()).not.toBeInTheDocument()

        await userEvent.click(document.body)
        await userEvent.keyboard('?')

        expect(help()).toBeInTheDocument()
    })

    it('does not open over the palette, and the palette does not open over it', async () => {
        renderApp('/')
        await appReady()

        await userEvent.keyboard(chord)
        await userEvent.keyboard('?')

        expect(palette()).toBeInTheDocument()
        expect(queryHelp()).not.toBeInTheDocument()

        await userEvent.keyboard('{Escape}')
        await until(() => expect(queryPalette()).not.toBeInTheDocument())
        await userEvent.keyboard('?')
        await userEvent.keyboard(chord)

        expect(help()).toBeInTheDocument()
        expect(queryPalette()).not.toBeInTheDocument()
    })

    it('returns focus to what had it when it closes', async () => {
        renderApp('/')
        await appReady()
        const link = within(
            screen.getByRole('navigation', { name: 'Main' }),
        ).getByRole('link', { name: 'Agents' })

        link.focus()
        await userEvent.keyboard('?')

        expect(link).not.toHaveFocus()

        await userEvent.keyboard('{Escape}')
        await until(() => expect(link).toHaveFocus())
    })
})

describe('the palette’s Keyboard shortcuts action', () => {
    const action = () =>
        within(palette()).getByRole('option', { name: /^Keyboard shortcuts/ })

    it('is offered with ? beside it, and is found by its keywords', async () => {
        renderApp('/')
        await appReady()
        await userEvent.keyboard(chord)

        expect(action()).toHaveTextContent('Keyboard shortcuts?Action')
        expect(action().querySelector('kbd[data-slot=kbd]')).toHaveTextContent(
            '?',
        )

        await userEvent.keyboard('hotkeys')

        expect(
            within(palette())
                .getAllByRole('option')
                .map((o) => o.textContent),
        ).toEqual(['Keyboard shortcuts?Action'])
    })

    it('closes the palette and opens the help, with the whole table', async () => {
        renderApp('/traces')
        await appReady()
        await userEvent.keyboard(chord)

        await userEvent.click(action())
        await until(() => expect(queryPalette()).not.toBeInTheDocument())

        expect(help()).toBeInTheDocument()
        expect(rows()).toHaveLength(shortcuts.length)
    })

    it('opens with Enter, and gives focus back to what had it before the palette', async () => {
        renderApp('/')
        await appReady()
        const link = within(
            screen.getByRole('navigation', { name: 'Main' }),
        ).getByRole('link', { name: 'Agents' })

        link.focus()
        await userEvent.keyboard(chord)
        await userEvent.keyboard('shortcuts{Enter}')
        await until(() => expect(queryHelp()).toBeInTheDocument())

        await userEvent.keyboard('{Escape}')
        await until(() => expect(queryHelp()).not.toBeInTheDocument())
        await until(() => expect(link).toHaveFocus())
    })
})
