import { useEffect, useRef } from 'react'

/** What the person is typing into: a key pressed there is text, not a shortcut. */
const typing =
    'input, textarea, select, [role="textbox"], [role="combobox"], [role="searchbox"], [contenteditable]:not([contenteditable="false" i])'

/** Open layers that take the keyboard for themselves: dialogs, menus and open selects. */
const layers =
    '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'

/**
 * Single-key shortcuts for the page: `handlers` maps a key (`j`) to what it does. One `keydown`
 * listener serves them all. A key does nothing while the person is typing in a field, with
 * ctrl, alt or meta held, while a key is held down, or while a dialog or menu is open; a key
 * whose handler is `undefined` does nothing either, so a shortcut is switched off by leaving its
 * handler out. The latest handlers are used without registering the listener again.
 */
export function useShortcuts(
    handlers: Record<string, (() => void) | undefined>,
): void {
    const latest = useRef(handlers)

    useEffect(() => {
        latest.current = handlers
    })

    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            const handler = Object.hasOwn(latest.current, event.key)
                ? latest.current[event.key]
                : undefined

            if (
                handler === undefined ||
                event.defaultPrevented ||
                event.repeat ||
                event.isComposing ||
                event.ctrlKey ||
                event.altKey ||
                event.metaKey ||
                (event.target instanceof Element &&
                    (event.target.closest(typing) !== null ||
                        (event.target instanceof HTMLElement &&
                            event.target.isContentEditable))) ||
                document.querySelector(layers) !== null
            ) {
                return
            }

            event.preventDefault()
            handler()
        }

        document.addEventListener('keydown', onKeyDown)

        return () => document.removeEventListener('keydown', onKeyDown)
    }, [])
}
