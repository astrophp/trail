import { useNavigate } from 'react-router'
import { useShortcuts, type ShortcutHandlers } from '@/hooks/use-shortcuts'
import { navPages } from '@/lib/nav-pages'

/**
 * `g` then a letter goes to a page of the navigation. It goes where the sidebar's link goes: the
 * page's own path, so the time range and the view of the page left are not carried over (each
 * page starts from its defaults, as it does from the sidebar).
 */
export function usePageShortcuts(): void {
    const navigate = useNavigate()
    const handlers: ShortcutHandlers = {}

    for (const { section, path } of navPages) {
        handlers[`go-${section}`] = () => void navigate(path)
    }

    useShortcuts(handlers)
}
