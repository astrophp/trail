import { useEffect, useRef } from 'react'
import { isApplePlatform } from '@/lib/platform'
import {
    isModified,
    matchesChord,
    shortcuts,
    type BindableId,
    type Shortcut,
    type ShortcutId,
} from '@/lib/shortcuts'

/** What the person is typing into: a key pressed there is text, not a shortcut. */
const typing =
    'input:not([type=checkbox i], [type=radio i], [type=button i], [type=submit i], [type=reset i], [type=range i], [type=file i], [type=color i], [type=image i]), textarea, select, [role="textbox"], [role="combobox"], [role="searchbox"], [contenteditable]:not([contenteditable="false" i])'

/** Open layers that take the keyboard for themselves: dialogs, menus and open selects. */
export const layers =
    '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'

/** How long the second key of a sequence may take, in milliseconds, before the first is forgotten. */
export const sequenceWindow = 1500

/** Keys that are only a modifier going down: they start nothing and do not abandon a sequence. */
const modifierKeys = new Set([
    'Shift',
    'Control',
    'Alt',
    'AltGraph',
    'Meta',
    'CapsLock',
    'NumLock',
    'Fn',
    'OS',
])

/**
 * What a shortcut does. Returning `false` says it did nothing (no row to go to, the last page), and
 * the key is then left to the browser; anything else says it acted, and the key is taken from it.
 */
export type ShortcutHandler = () => void | false

/** The handlers of a component, by shortcut id. A shortcut without a handler is off. */
export type ShortcutHandlers = Partial<
    Record<BindableId, ShortcutHandler | undefined>
>

/** Every mounted component's latest handlers; one listener serves all of them. */
const registered = new Set<{ current: ShortcutHandlers }>()

/** The first key of a sequence that has been pressed, until its second comes or time runs out. */
let pending: { first: string; timer: number } | null = null

/** Forgets a first key that is waiting for its second (the page changed under it). */
export function cancelSequence() {
    forgetFirst()
}

function forgetFirst() {
    if (pending !== null) {
        window.clearTimeout(pending.timer)
        pending = null
    }
}

type Bound = { entry: Shortcut; handler: ShortcutHandler }

/** What is bound right now. When two components bind one shortcut, the one mounted first has it. */
function bound(): Bound[] {
    const found = new Map<string, Bound>()

    for (const { current } of registered) {
        for (const entry of shortcuts) {
            const handler = Object.hasOwn(current, entry.id)
                ? current[entry.id as BindableId]
                : undefined

            if (handler !== undefined && !found.has(entry.id)) {
                found.set(entry.id, { entry, handler })
            }
        }
    }

    return [...found.values()]
}

/** The ids that have a handler right now: what is on this page and can be done. */
export function boundShortcutIds(): ShortcutId[] {
    return bound().map(({ entry }) => entry.id)
}

const isTyping = (target: EventTarget | null) =>
    target instanceof Element &&
    (target.closest(typing) !== null ||
        (target instanceof HTMLElement && target.isContentEditable))

/** Whether a dialog, menu or select is open that the shortcut does not belong to. */
const otherLayerOpen = (own: string | undefined) =>
    [...document.querySelectorAll(layers)].some(
        (layer) => own === undefined || layer.closest(own) === null,
    )

/**
 * Whether the key may do its shortcut now. A plain key never fires while the person types or when
 * something else has taken the key; a modified one (the palette's) does, in a field too. Neither
 * fires while a dialog, menu or select is open, unless it is that dialog's own shortcut.
 */
function allowed(entry: Shortcut, event: KeyboardEvent): boolean {
    const plain = !entry.keys.some(isModified)

    return (
        !(plain && (event.defaultPrevented || isTyping(event.target))) &&
        !otherLayerOpen(entry.ownLayer)
    )
}

const isPlain = (event: KeyboardEvent) =>
    !event.ctrlKey && !event.altKey && !event.metaKey

function onKeyDown(event: KeyboardEvent) {
    if (event.repeat || event.isComposing || modifierKeys.has(event.key)) {
        return
    }

    const active = bound()
    const apple = isApplePlatform()

    if (pending !== null) {
        const { first } = pending

        forgetFirst()

        const second = active.find(
            ({ entry }) =>
                entry.keys.length === 2 &&
                entry.keys[0] === first &&
                matchesChord(entry.keys[1], event, apple) &&
                allowed(entry, event),
        )

        if (second !== undefined) {
            if (second.handler() !== false) {
                event.preventDefault()
            }

            return
        }

        // A key that does not continue the sequence ends it and does nothing itself: it is not
        // taken as if pressed fresh. A chord with a modifier (⌘K) is a gesture of its own and goes on.
        if (isPlain(event)) {
            return
        }
    }

    const single = active.find(
        ({ entry }) =>
            entry.keys.length === 1 &&
            matchesChord(entry.keys[0], event, apple) &&
            allowed(entry, event),
    )

    if (single !== undefined) {
        if (single.handler() !== false) {
            event.preventDefault()
        }

        return
    }

    const first = active.find(
        ({ entry }) =>
            entry.keys.length === 2 &&
            matchesChord(entry.keys[0], event, apple) &&
            allowed(entry, event),
    )

    if (first !== undefined) {
        pending = {
            first: first.entry.keys[0],
            timer: window.setTimeout(forgetFirst, sequenceWindow),
        }
    }
}

/**
 * Binds shortcuts of the table in `lib/shortcuts` by id: `handlers` maps an id to what it does,
 * and the keys come from the table, so a key that is not in it cannot be bound. One `keydown`
 * listener serves every component that calls this, sequences included.
 *
 * A key does nothing while the person is typing in a field, with ctrl, alt or meta held, while a
 * key is held down, during an IME composition, or while a dialog, menu or select is open. The one
 * shortcut with a modifier (the palette's) works in a field too, and a shortcut that belongs to a
 * dialog works while that dialog is open. A shortcut whose handler is `undefined` does nothing
 * either, so it is switched off by leaving its handler out. The latest handlers are used without
 * registering the listener again.
 *
 * A sequence (`g` then `t`) starts with its first key, and the second must follow within
 * `sequenceWindow`. Any other key ends it and does nothing itself, so `g` then `j` is not a `j`.
 */
export function useShortcuts(handlers: ShortcutHandlers): void {
    const latest = useRef(handlers)

    useEffect(() => {
        latest.current = handlers
    })

    useEffect(() => {
        if (registered.size === 0) {
            document.addEventListener('keydown', onKeyDown)
        }

        registered.add(latest)

        return () => {
            registered.delete(latest)

            if (registered.size === 0) {
                document.removeEventListener('keydown', onKeyDown)
                forgetFirst()
            }
        }
    }, [])
}
