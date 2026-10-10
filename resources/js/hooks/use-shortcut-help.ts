import { createContext, useContext } from 'react'

export type ShortcutHelpControls = {
    /** Whether the help dialog is open. */
    open: boolean
    /**
     * Opens it. `from` is what to return focus to when it closes, for an opener that is about to
     * go away (the palette); by default, what has focus now.
     */
    show: (from?: HTMLElement | null) => void
}

export const ShortcutHelpContext = createContext<ShortcutHelpControls | null>(
    null,
)

/** Opens the keyboard shortcuts help from anywhere inside the shell. */
export function useShortcutHelp(): ShortcutHelpControls {
    const controls = useContext(ShortcutHelpContext)

    if (controls === null) {
        throw new Error(
            'useShortcutHelp must be used within the shortcut help provider.',
        )
    }

    return controls
}
