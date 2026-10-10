import { useEffect, useRef } from 'react'
import { isApplePlatform } from '@/lib/platform'

/**
 * Another dialog, sheet or alert dialog that is open and is not the palette itself (which marks
 * its content `data-palette`). The palette does not open on top of one.
 */
const otherLayer =
    '[role="dialog"]:not([data-palette]), [role="alertdialog"]:not([data-palette])'

/**
 * The palette's one shortcut: ⌘K on an Apple platform, Ctrl K elsewhere, calls `toggle`. It works
 * from anywhere on the page, also in a field the person is typing in (the one shortcut that does),
 * and it takes the key from the browser, which binds Ctrl K to its own search on some systems.
 * It does nothing while another dialog is open, while a key is held down, during an IME
 * composition, or with Shift or Alt held. The latest `toggle` is used without registering the
 * listener again.
 *
 * Kept apart from the palette so a later shared table of shortcuts can register the same key.
 */
export function usePaletteShortcut(toggle: () => void): void {
    const latest = useRef(toggle)

    useEffect(() => {
        latest.current = toggle
    })

    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            if (
                event.key.toLowerCase() !== 'k' ||
                event.repeat ||
                event.isComposing ||
                event.altKey ||
                event.shiftKey
            ) {
                return
            }

            const held = isApplePlatform()
                ? event.metaKey && !event.ctrlKey
                : event.ctrlKey && !event.metaKey

            if (!held || document.querySelector(otherLayer) !== null) {
                return
            }

            event.preventDefault()
            latest.current()
        }

        document.addEventListener('keydown', onKeyDown)

        return () => document.removeEventListener('keydown', onKeyDown)
    }, [])
}
