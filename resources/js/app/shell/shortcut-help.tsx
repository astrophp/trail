import { useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { resolveRoute } from '@/app/routes'
import { shortcutGroups } from '@/app/shell/shortcut-groups'
import { ShortcutsDialog } from '@/components/patterns/shortcuts-dialog'
import {
    ShortcutHelpContext,
    type ShortcutHelpControls,
} from '@/hooks/use-shortcut-help'
import { boundShortcutIds, useShortcuts } from '@/hooks/use-shortcuts'
import type { ShortcutId } from '@/lib/shortcuts'
import { isApplePlatform } from '@/lib/platform'

/**
 * The keyboard shortcuts help, and the state that opens it, for everything inside: `?` opens it
 * (and closes it again), and the palette's "Keyboard shortcuts" action opens it through
 * `useShortcutHelp`. It lists the whole table of shortcuts, the ones that apply to the current
 * page first. Opening it changes no URL and remounts no page.
 *
 * Focus returns to what had it, or to what the opener says (the palette is closing, so it names
 * what the palette was going to return to).
 */
export function ShortcutHelpProvider({ children }: { children: ReactNode }) {
    const [open, setOpen] = useState(false)
    const returnTo = useRef<HTMLElement | null>(null)
    // What could be done on the page when the help was opened.
    const [available, setAvailable] = useState<ReadonlySet<ShortcutId>>(
        new Set(),
    )
    const { pathname } = useLocation()
    const page = resolveRoute(pathname).shortcuts

    function change(next: boolean, from?: HTMLElement | null) {
        if (next) {
            const ids = new Set(boundShortcutIds())

            // Enter on a focused link is the browser's: it can be done where a row has a link.
            if (document.querySelector('tbody [data-slot="row-link"]')) {
                ids.add('row-open')
            }

            setAvailable(ids)
            returnTo.current =
                from !== undefined
                    ? from
                    : document.activeElement instanceof HTMLElement
                      ? document.activeElement
                      : null
        }

        setOpen(next)
    }

    useShortcuts({ help: () => change(!open) })

    const controls: ShortcutHelpControls = {
        open,
        show: (from) => change(true, from),
    }

    return (
        <ShortcutHelpContext value={controls}>
            {children}
            <ShortcutsDialog
                open={open}
                onOpenChange={(next) => change(next)}
                title="Keyboard shortcuts"
                description="Shortcuts do not work while you are typing in a field."
                groups={shortcutGroups(page, isApplePlatform(), available)}
                onCloseAutoFocus={(event) => {
                    // The dialog has no trigger of its own for the browser to return focus to.
                    event.preventDefault()

                    if (returnTo.current?.isConnected) {
                        returnTo.current.focus({ preventScroll: true })
                    }
                }}
            />
        </ShortcutHelpContext>
    )
}
