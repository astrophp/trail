import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'
import {
    cancelSequence,
    useShortcuts,
    type ShortcutHandlers,
} from '@/hooks/use-shortcuts'
import { navPages } from '@/lib/nav-pages'

/**
 * `g` then a letter goes to a page of the navigation. It goes where the sidebar's link goes: the
 * page's own path, so the time range and the view of the page left are not carried over (each
 * page starts from its defaults, as it does from the sidebar).
 *
 * A first key waiting for its second is forgotten when the location changes: the second key then
 * belongs to the page it was not pressed on.
 */
export function usePageShortcuts(): void {
    const navigate = useNavigate()
    const { key } = useLocation()

    useEffect(() => cancelSequence(), [key])
    const handlers: ShortcutHandlers = {}

    for (const { section, path } of navPages) {
        handlers[`go-${section}`] = () => void navigate(path)
    }

    useShortcuts(handlers)
}
