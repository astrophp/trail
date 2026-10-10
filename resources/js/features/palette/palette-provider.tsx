import { useRef, useState, type ReactNode } from 'react'
import { useNavigate, type To } from 'react-router'
import { CommandPalette } from '@/components/patterns/command-palette'
import { PaletteBody } from '@/features/palette/palette-body'
import {
    PaletteContext,
    type PaletteControls,
} from '@/features/palette/palette-context'
import { useShortcutHelp } from '@/hooks/use-shortcut-help'
import { usePaletteShortcut } from '@/features/palette/use-palette-shortcut'

/**
 * The command palette, and the state that opens it, for everything inside. Opening it changes
 * this component's state only: the page under it is not navigated, re-rendered with other
 * props or remounted, so a typed search, a selection and unsaved edits stay as they are.
 *
 * It closes when an option is chosen, and the search text is dropped with it. Focus returns to
 * what had it, unless the choice took the person to another page: that page then handles focus
 * as any navigation does.
 */
export function PaletteProvider({ children }: { children: ReactNode }) {
    const [open, setOpen] = useState(false)
    const [text, setText] = useState('')
    const navigate = useNavigate()
    const help = useShortcutHelp()
    const openedOn = useRef('')
    const returnTo = useRef<HTMLElement | null>(null)

    function change(next: boolean, from?: HTMLElement) {
        if (next) {
            openedOn.current = window.location.pathname
            returnTo.current =
                from ??
                (document.activeElement instanceof HTMLElement
                    ? document.activeElement
                    : null)
        } else {
            setText('')
        }

        setOpen(next)
    }

    function go(to: To) {
        void navigate(to)
        change(false)
    }

    usePaletteShortcut(() => change(!open))

    // The help takes over the focus the palette was going to give back, and gives it back itself.
    function showHelp() {
        const from = returnTo.current

        returnTo.current = null
        change(false)
        help.show(from)
    }

    const controls: PaletteControls = {
        open,
        toggle: () => change(!open),
        show: (from) => change(true, from),
    }

    return (
        <PaletteContext value={controls}>
            {children}
            <CommandPalette
                open={open}
                onOpenChange={(next) => change(next)}
                value={text}
                onValueChange={setText}
                title="Search"
                label="Search runs, conversations and agents"
                description="Go to a page, run an action, or find a run, a conversation or an agent."
                onCloseAutoFocus={(event) => {
                    // The dialog has no trigger of its own for the browser to return focus to.
                    event.preventDefault()

                    // Unless the choice led to another page: that page has taken focus to its heading.
                    if (window.location.pathname === openedOn.current) {
                        returnTo.current?.focus({ preventScroll: true })
                    }
                }}
            >
                <PaletteBody
                    text={text}
                    go={go}
                    followed={() => change(false)}
                    close={() => change(false)}
                    showHelp={showHelp}
                />
            </CommandPalette>
        </PaletteContext>
    )
}
