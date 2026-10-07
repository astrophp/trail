import { useEffect, useRef } from 'react'
import {
    NavigationType,
    Outlet,
    useLocation,
    useNavigationType,
} from 'react-router'
import { AppSidebar } from '@/app/shell/app-sidebar'
import { TopBar } from '@/app/shell/top-bar'
import { documentTitle, resolveRoute } from '@/app/routes'
import { SidebarProvider, useSidebar } from '@/components/ui/sidebar'
import { useDocumentTitle } from '@/hooks/use-document-title'

/**
 * After a client-side page change the new page's heading gets focus (the main
 * region when the page has none) and the page is scrolled to the top. Back and
 * Forward keep the scroll position the browser restores. The first load is left alone.
 */
function useFocusPageHeading(main: React.RefObject<HTMLElement | null>) {
    const { pathname } = useLocation()
    const navigationType = useNavigationType()
    const { openMobile } = useSidebar()
    const shown = useRef(pathname)
    const pending = useRef(false)

    useEffect(() => {
        if (shown.current !== pathname) {
            shown.current = pathname
            pending.current = true
        }

        // Wait for the drawer to close: while it is open it keeps focus inside itself.
        if (pending.current && !openMobile) {
            pending.current = false

            if (navigationType !== NavigationType.Pop) {
                window.scrollTo(0, 0)
            }

            // Scrolling is decided above, so focusing never scrolls on its own.
            const target = main.current?.querySelector('h1') ?? main.current

            target?.focus({ preventScroll: true })
        }
    }, [pathname, navigationType, openMobile, main])
}

/**
 * The shadcn sidebar listens for ⌘B / Ctrl+B on the window, toggles itself, swallows the
 * key and stores a cookie on the host application's domain. Here the desktop sidebar
 * never collapses, so the chord is stopped in the capture phase, before that listener
 * (bubble phase, same target) sees it. The browser's own ⌘B is left alone.
 */
function useIgnoreSidebarShortcut() {
    useEffect(() => {
        const stop = (event: KeyboardEvent) => {
            if (event.key === 'b' && (event.metaKey || event.ctrlKey)) {
                event.stopImmediatePropagation()
            }
        }

        window.addEventListener('keydown', stop, true)

        return () => window.removeEventListener('keydown', stop, true)
    }, [])
}

/**
 * Radix returns focus to a trigger it knows about; the sidebar's trigger is a
 * plain button, so when the drawer closes without a page change, focus goes back to it here.
 */
function useReturnFocusToTrigger(trigger: React.RefObject<HTMLElement | null>) {
    const { openMobile } = useSidebar()
    const { pathname } = useLocation()
    const wasOpen = useRef(false)
    const openedOn = useRef(pathname)

    useEffect(() => {
        if (openMobile) {
            if (!wasOpen.current) {
                openedOn.current = pathname
            }
        } else if (wasOpen.current && openedOn.current === pathname) {
            trigger.current?.focus()
        }

        wasOpen.current = openMobile
    }, [openMobile, pathname, trigger])
}

function Frame() {
    const { pathname } = useLocation()
    const main = useRef<HTMLElement>(null)
    const trigger = useRef<HTMLButtonElement>(null)

    useDocumentTitle(documentTitle(resolveRoute(pathname)))
    useFocusPageHeading(main)
    useIgnoreSidebarShortcut()
    useReturnFocusToTrigger(trigger)

    return (
        <>
            <a
                href="#content"
                className="sr-only rounded-lg bg-background px-3 py-2 text-ui text-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:ring-2 focus:ring-ring"
            >
                Skip to content
            </a>
            <AppSidebar />
            <div className="flex min-w-0 flex-1 flex-col bg-background">
                <TopBar triggerRef={trigger} />
                <main
                    ref={main}
                    id="content"
                    tabIndex={-1}
                    className="mx-auto w-full max-w-450 flex-1 scroll-mt-13.5 px-3.75 py-5 outline-none xs:px-4.75 xs:py-5.5 md:scroll-mt-14.25 md:px-5.75 md:py-5.75 wide:px-6.5 wide:py-6.5 roomy:p-8"
                >
                    <Outlet />
                </main>
            </div>
        </>
    )
}

export function AppShell() {
    return (
        <SidebarProvider
            // The sidebar is not collapsible on a wide screen: it is always open.
            open
            onOpenChange={() => {}}
            style={
                {
                    '--sidebar-width': 'var(--shell-sidebar-width)',
                } as React.CSSProperties
            }
        >
            <Frame />
        </SidebarProvider>
    )
}
