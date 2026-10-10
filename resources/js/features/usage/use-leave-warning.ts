import { useEffect } from 'react'

export const leaveWarning =
    'You have unsaved price changes. Leave this page and discard them?'

/**
 * Warns before the page is left while `unsaved` is true. The app's router is not a data router,
 * so it has no way to block a navigation; this is the smallest thing that covers the ways a
 * person leaves:
 *
 * - Closing or reloading the tab, or following a link to another site: the browser's own prompt
 *   (`beforeunload`).
 * - Following a link of the app to another page: one confirmation, and the click is cancelled
 *   when declined. A link that stays on this page (another query string, the same path) is not a
 *   departure, and a click with a modifier key opens elsewhere and leaves this page where it is.
 *
 * The browser's Back and Forward buttons are not intercepted: the location has already changed
 * when the router hears of it.
 */
export function useLeaveWarning(unsaved: boolean): void {
    useEffect(() => {
        if (!unsaved) {
            return
        }

        const beforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault()
        }
        const click = (event: MouseEvent) => {
            const link =
                event.target instanceof Element
                    ? event.target.closest('a[href]')
                    : null

            if (
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey ||
                !(link instanceof HTMLAnchorElement) ||
                (link.target !== '' && link.target !== '_self') ||
                link.hasAttribute('download')
            ) {
                return
            }

            const to = new URL(link.href, window.location.href)

            // Another site is the browser's to ask about; the same path is not leaving.
            if (
                to.origin !== window.location.origin ||
                to.pathname === window.location.pathname
            ) {
                return
            }

            if (!window.confirm(leaveWarning)) {
                event.preventDefault()
                event.stopPropagation()
            }
        }

        window.addEventListener('beforeunload', beforeUnload)
        // In the capture phase, ahead of the router's own handler of the click.
        document.addEventListener('click', click, true)

        return () => {
            window.removeEventListener('beforeunload', beforeUnload)
            document.removeEventListener('click', click, true)
        }
    }, [unsaved])
}
