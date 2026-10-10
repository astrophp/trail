import { navPages, type Section } from '@/lib/nav-pages'
import { isApplePlatform } from '@/lib/platform'

/**
 * Where a shortcut applies: on every page, on the list pages (traces, conversations, agents and
 * usage), on a run's page, or on a conversation's page.
 */
export type ShortcutScope = 'everywhere' | 'list' | 'trace' | 'conversation'

/** The scopes in the order the help lists them when none applies first. */
export const shortcutScopes: readonly ShortcutScope[] = [
    'everywhere',
    'list',
    'trace',
    'conversation',
]

/** What the help calls each scope. */
export const scopeHeadings: Record<ShortcutScope, string> = {
    everywhere: 'Everywhere',
    list: 'Lists',
    trace: 'Run page',
    conversation: 'Conversation page',
}

/**
 * One shortcut. `keys` is one chord, or two for a sequence (`g` then `t`). A chord is a key as
 * `KeyboardEvent.key` spells it (`j`, `?`, `Enter`), or `mod+` and a key: Command on an Apple
 * platform, Control elsewhere.
 */
type Definition = {
    keys: readonly [string] | readonly [string, string]
    label: string
    scope: ShortcutScope
    /**
     * The browser does this itself (Enter on a focused link): the table lists it so the help is
     * complete, and nothing can bind it.
     */
    native?: true
    /**
     * A selector for the dialog this shortcut belongs to. Other open dialogs, menus and selects stop
     * the shortcut, that one does not, so the same key can close it.
     */
    ownLayer?: string
}

/**
 * The shortcuts that are not a page of the navigation. The key of each is its id; the keys, the
 * label and the scope are what the hook that binds it and the help that lists it both read.
 */
const fixed = {
    help: {
        keys: ['?'],
        label: 'Show keyboard shortcuts',
        scope: 'everywhere',
        ownLayer: '[data-shortcut-help]',
    },
    palette: {
        keys: ['mod+k'],
        label: 'Open the command palette',
        scope: 'everywhere',
        ownLayer: '[data-palette]',
    },
    search: {
        keys: ['/'],
        label: 'Search this list',
        scope: 'list',
    },
    'row-next': {
        keys: ['j'],
        label: 'Next row',
        scope: 'list',
    },
    'row-previous': {
        keys: ['k'],
        label: 'Previous row',
        scope: 'list',
    },
    'row-open': {
        keys: ['Enter'],
        label: 'Open the focused row',
        scope: 'list',
        native: true,
    },
    'page-next': {
        keys: [']'],
        label: 'Next page',
        scope: 'list',
    },
    'page-previous': {
        keys: ['['],
        label: 'Previous page',
        scope: 'list',
    },
    'trace-next': {
        keys: ['j'],
        label: 'Next run',
        scope: 'trace',
    },
    'trace-previous': {
        keys: ['k'],
        label: 'Previous run',
        scope: 'trace',
    },
    'trace-back': {
        keys: ['g', 'b'],
        label: 'Back to where you came from',
        scope: 'trace',
    },
    'conversation-back': {
        keys: ['g', 'b'],
        label: 'Back to the conversations',
        scope: 'conversation',
    },
} as const satisfies Record<string, Definition>

/** The letter after `g` that goes to each page of the navigation. */
const pageLetters = {
    overview: 'o',
    traces: 't',
    conversations: 'c',
    agents: 'a',
    usage: 'u',
} as const satisfies Record<Section, string>

type FixedId = keyof typeof fixed

type NativeId = {
    [K in FixedId]: (typeof fixed)[K] extends { native: true } ? K : never
}[FixedId]

export type ShortcutId = FixedId | `go-${Section}`

/** The shortcuts a component can bind: everything the browser does not already do itself. */
export type BindableId = Exclude<ShortcutId, NativeId>

export type Shortcut = Definition & { id: ShortcutId }

const pages: Shortcut[] = navPages.map(({ section, title }) => ({
    id: `go-${section}` as const,
    keys: ['g', pageLetters[section]],
    label: `Go to ${title}`,
    scope: 'everywhere',
}))

/** Every shortcut of the dashboard: the one table the hooks bind from and the help lists. */
export const shortcuts: readonly Shortcut[] = [
    ...(Object.entries(fixed) as [FixedId, Definition][]).map(
        ([id, definition]) => ({ id, ...definition }),
    ),
    ...pages,
]

/** The shortcut with this id. */
export function shortcut(id: ShortcutId): Shortcut {
    const found = shortcuts.find((entry) => entry.id === id)

    if (found === undefined) {
        throw new Error(`No shortcut ${id}.`)
    }

    return found
}

const modPrefix = 'mod+'

/** Whether a chord needs the platform's shortcut modifier. */
export function isModified(chord: string): boolean {
    return chord.startsWith(modPrefix)
}

/** The key a chord is pressed with, without its modifier. */
function keyOf(chord: string): string {
    return isModified(chord) ? chord.slice(modPrefix.length) : chord
}

/**
 * Whether the event is this chord. A plain chord needs the key itself and no Control, Alt or
 * Command (Shift is part of the key it types: `?`, a capital letter). A modified chord needs the
 * platform's modifier alone, with the key in either case (Caps Lock) and without Shift or Alt.
 */
export function matchesChord(
    chord: string,
    event: KeyboardEvent,
    apple: boolean = isApplePlatform(),
): boolean {
    if (!isModified(chord)) {
        return (
            event.key === chord &&
            !event.ctrlKey &&
            !event.altKey &&
            !event.metaKey
        )
    }

    const held = apple
        ? event.metaKey && !event.ctrlKey
        : event.ctrlKey && !event.metaKey

    return (
        held &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === keyOf(chord)
    )
}

/** A chord as the key cap shows it: `⌘K` or `Ctrl K` for the modified one, the key itself otherwise. */
export function chordLabel(
    chord: string,
    apple: boolean = isApplePlatform(),
): string {
    return isModified(chord)
        ? `${apple ? '⌘' : 'Ctrl '}${keyOf(chord).toUpperCase()}`
        : chord
}

/** The key caps of a shortcut, one per press: a sequence has two. */
export function keyCaps(
    id: ShortcutId,
    apple: boolean = isApplePlatform(),
): string[] {
    return shortcut(id).keys.map((chord) => chordLabel(chord, apple))
}

/**
 * The value of `aria-keyshortcuts` for a control the shortcut reaches: modifiers and the key
 * joined by `+`, as the attribute is written. The attribute has no way to say that two keys are
 * pressed one after the other, so a sequence has none (`undefined`).
 */
export function ariaKeyShortcuts(
    id: ShortcutId,
    apple: boolean = isApplePlatform(),
): string | undefined {
    const { keys } = shortcut(id)

    if (keys.length !== 1) {
        return undefined
    }

    const [chord] = keys

    return isModified(chord)
        ? `${apple ? 'Meta' : 'Control'}+${keyOf(chord).toUpperCase()}`
        : chord
}
