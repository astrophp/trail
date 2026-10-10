import { describe, expect, it } from 'vitest'
import { navPages } from '@/lib/nav-pages'
import {
    ariaKeyShortcuts,
    chordLabel,
    isModified,
    keyCaps,
    matchesChord,
    scopeHeadings,
    shortcut,
    shortcutScopes,
    shortcuts,
} from '@/lib/shortcuts'

const press = (key: string, init: KeyboardEventInit = {}) =>
    new KeyboardEvent('keydown', { key, ...init })

/** Two scopes can be active at once when one of them is `everywhere`, or they are the same. */
const overlap = (a: string, b: string) =>
    a === b || a === 'everywhere' || b === 'everywhere'

describe('the table of shortcuts', () => {
    it('gives every shortcut an id of its own, a label, and a scope that exists', () => {
        expect(new Set(shortcuts.map((entry) => entry.id)).size).toBe(
            shortcuts.length,
        )

        for (const entry of shortcuts) {
            expect(entry.label).not.toBe('')
            expect(shortcutScopes).toContain(entry.scope)
            expect(scopeHeadings[entry.scope]).not.toBe('')
        }
    })

    it('goes to every page of the navigation with `g` and its own letter, derived from the navigation', () => {
        const goes = shortcuts.filter((entry) => entry.id.startsWith('go-'))

        expect(goes.map((entry) => entry.id)).toEqual(
            navPages.map((page) => `go-${page.section}`),
        )
        expect(goes.map((entry) => entry.keys[0])).toEqual(
            navPages.map(() => 'g'),
        )
        expect(new Set(goes.map((entry) => entry.keys[1])).size).toBe(
            navPages.length,
        )
        expect(goes.map((entry) => entry.label)).toEqual(
            navPages.map((page) => `Go to ${page.title}`),
        )
        expect(goes.every((entry) => entry.scope === 'everywhere')).toBe(true)
    })

    it('never gives two shortcuts that can be active together the same keys', () => {
        for (const a of shortcuts) {
            for (const b of shortcuts) {
                if (a !== b && overlap(a.scope, b.scope)) {
                    expect(a.keys.join(' '), `${a.id} and ${b.id}`).not.toBe(
                        b.keys.join(' '),
                    )
                }
            }
        }
    })

    it('never uses a key both on its own and as the start of a sequence', () => {
        const starts = new Set(
            shortcuts.filter((e) => e.keys.length === 2).map((e) => e.keys[0]),
        )

        for (const entry of shortcuts.filter((e) => e.keys.length === 1)) {
            expect(starts.has(entry.keys[0]), entry.id).toBe(false)
        }
    })

    it('has no modifier on a sequence, and a modifier on one shortcut only: the palette', () => {
        const modified = shortcuts.filter((entry) =>
            entry.keys.some(isModified),
        )

        expect(modified.map((entry) => entry.id)).toEqual(['palette'])
        expect(
            shortcuts
                .filter((entry) => entry.keys.length === 2)
                .every((entry) => !entry.keys.some(isModified)),
        ).toBe(true)
    })

    it('marks as native only the one the browser does itself', () => {
        expect(
            shortcuts.filter((entry) => entry.native).map((e) => e.id),
        ).toEqual(['row-open'])
        expect(shortcut('row-open').keys).toEqual(['Enter'])
    })

    it('has the scopes in the table that the help names', () => {
        expect(new Set(shortcuts.map((entry) => entry.scope))).toEqual(
            new Set(shortcutScopes),
        )
    })

    it('finds a shortcut by id and refuses one it does not have', () => {
        expect(shortcut('help').keys).toEqual(['?'])
        // @ts-expect-error a key is not an id
        expect(() => shortcut('j')).toThrow('No shortcut j.')
    })
})

describe('matchesChord', () => {
    it('takes a plain key as typed, with Shift for what needs it, and nothing else held', () => {
        expect(matchesChord('j', press('j'))).toBe(true)
        expect(matchesChord('?', press('?', { shiftKey: true }))).toBe(true)
        expect(matchesChord('j', press('J', { shiftKey: true }))).toBe(false)
        expect(matchesChord('j', press('J'))).toBe(false)
        expect(matchesChord('j', press('j', { ctrlKey: true }))).toBe(false)
        expect(matchesChord('j', press('j', { altKey: true }))).toBe(false)
        expect(matchesChord('j', press('j', { metaKey: true }))).toBe(false)
        expect(matchesChord('j', press('k'))).toBe(false)
    })

    it('takes the platform’s modifier alone for a modified chord, in either case', () => {
        expect(matchesChord('mod+k', press('k', { metaKey: true }), true)).toBe(
            true,
        )
        expect(
            matchesChord('mod+k', press('K', { ctrlKey: true }), false),
        ).toBe(true)
        expect(matchesChord('mod+k', press('k', { ctrlKey: true }), true)).toBe(
            false,
        )
        expect(
            matchesChord('mod+k', press('k', { metaKey: true }), false),
        ).toBe(false)
        expect(matchesChord('mod+k', press('k'), false)).toBe(false)
        expect(
            matchesChord(
                'mod+k',
                press('k', { ctrlKey: true, shiftKey: true }),
                false,
            ),
        ).toBe(false)
        expect(
            matchesChord(
                'mod+k',
                press('k', { ctrlKey: true, altKey: true }),
                false,
            ),
        ).toBe(false)
    })
})

describe('how the keys are written', () => {
    it('draws the modified chord with the platform’s modifier and a plain one as it is', () => {
        expect(chordLabel('mod+k', true)).toBe('⌘K')
        expect(chordLabel('mod+k', false)).toBe('Ctrl K')
        expect(chordLabel('?', true)).toBe('?')
        expect(keyCaps('palette', true)).toEqual(['⌘K'])
        expect(keyCaps('palette', false)).toEqual(['Ctrl K'])
    })

    it('draws a sequence as one key cap per press', () => {
        expect(keyCaps('go-traces', false)).toEqual(['g', 't'])
    })

    it('writes aria-keyshortcuts as the attribute asks, and gives a sequence none', () => {
        expect(ariaKeyShortcuts('palette', true)).toBe('Meta+K')
        expect(ariaKeyShortcuts('palette', false)).toBe('Control+K')
        expect(ariaKeyShortcuts('search')).toBe('/')
        expect(ariaKeyShortcuts('help')).toBe('?')
        expect(ariaKeyShortcuts('page-next')).toBe(']')
        expect(ariaKeyShortcuts('go-usage')).toBeUndefined()
        expect(ariaKeyShortcuts('trace-back')).toBeUndefined()
    })
})
