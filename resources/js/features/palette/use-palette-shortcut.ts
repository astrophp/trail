import { useShortcuts } from '@/hooks/use-shortcuts'

/**
 * The palette's one shortcut: ⌘K on an Apple platform, Ctrl K elsewhere, calls `toggle`. It is the
 * `palette` entry of the table of shortcuts, and the one that works from anywhere on the page, also
 * in a field the person is typing in. It takes the key from the browser, which binds Ctrl K to its
 * own search on some systems. It does nothing while another dialog is open (the palette's own
 * dialog and what is inside it, its listbox included, do not count, so the same key can close it),
 * while a key is held down, during an IME composition, or with Shift or Alt held. The latest
 * `toggle` is used without registering the listener again.
 */
export function usePaletteShortcut(toggle: () => void): void {
    useShortcuts({ palette: toggle })
}
