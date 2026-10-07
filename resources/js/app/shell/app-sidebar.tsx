import { useEffect, useId } from 'react'
import { Link, useLocation } from 'react-router'
import { InFlightBadge, useInFlightCount } from '@/app/shell/in-flight-badge'
import { LogoMark, LogoWordmark } from '@/app/shell/logo'
import { navItems, resolveRoute } from '@/app/routes'
import { ThemeToggle } from '@/components/patterns/theme-toggle'
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from '@/components/ui/sidebar'
import { useBoot } from '@/hooks/use-boot'
import { useTimeRangeLink } from '@/hooks/use-time-range'

const capitalise = (text: string) =>
    text.charAt(0).toUpperCase() + text.slice(1)

export function AppSidebar() {
    const boot = useBoot()
    const { pathname, key } = useLocation()
    const { isMobile, setOpenMobile } = useSidebar()
    const current = resolveRoute(pathname).section
    const inFlight = useInFlightCount()
    const inFlightId = useId()
    const linkTo = useTimeRangeLink()

    // Following a link closes the drawer, even one to the page already open: the
    // location key is new on every navigation, the path is not.
    useEffect(() => setOpenMobile(false), [key, setOpenMobile])

    // A drawer left open while the window grows to desktop must not come back
    // when it shrinks again.
    useEffect(() => {
        if (!isMobile) {
            setOpenMobile(false)
        }
    }, [isMobile, setOpenMobile])

    return (
        <Sidebar collapsible="offcanvas" className="border-sidebar-border">
            <div className="flex size-full min-h-0 flex-col px-2.25 pt-6.25 pb-3.5 wide:px-3.5">
                <SidebarHeader className="gap-0 p-0">
                    <Link
                        to={linkTo('/')}
                        aria-label="Trail overview"
                        className="mb-6 flex items-center gap-2 rounded-lg pl-3.25 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                    >
                        <LogoMark className="size-9" />
                        <LogoWordmark className="h-auto w-16 text-foreground" />
                    </Link>
                    <div className="mx-1 mb-6.75 border-y border-sidebar-border px-2.25 py-4.25">
                        <p className="truncate text-xs leading-4.5 font-semibold">
                            {boot.appName ?? 'Laravel application'}
                        </p>
                        <p className="mt-1.25 flex h-4.5 items-center gap-1.5 text-caption text-muted-foreground">
                            <span
                                aria-hidden="true"
                                className="size-1.25 shrink-0 rounded-full bg-muted-foreground"
                            />
                            <span>{capitalise(boot.environment)}</span>
                            <span aria-hidden="true" className="text-faint">
                                ·
                            </span>
                            <span className="truncate font-mono">
                                {boot.path}
                            </span>
                        </p>
                    </div>
                </SidebarHeader>
                <SidebarContent>
                    <nav aria-label="Main">
                        <SidebarGroup className="p-0">
                            <SidebarGroupLabel className="mb-3 h-3.75 px-3 text-micro leading-3.75 font-normal tracking-[0.09em] text-faint uppercase">
                                Observe
                            </SidebarGroupLabel>
                            <SidebarGroupContent>
                                <SidebarMenu className="gap-0.75">
                                    {navItems.map(
                                        ({
                                            path,
                                            title,
                                            section,
                                            icon: Icon,
                                        }) => (
                                            <SidebarMenuItem key={section}>
                                                <SidebarMenuButton
                                                    asChild
                                                    isActive={
                                                        section === current
                                                    }
                                                    className="h-9.25 gap-2.5 rounded-lg px-3 py-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground active:bg-accent active:text-foreground wide:text-ui data-active:font-[550] data-active:hover:bg-sidebar-accent data-active:hover:text-sidebar-accent-foreground data-active:active:bg-sidebar-accent data-active:active:text-sidebar-accent-foreground [&_svg]:size-4.25"
                                                >
                                                    <Link
                                                        to={linkTo(path)}
                                                        aria-describedby={
                                                            section ===
                                                                'traces' &&
                                                            inFlight > 0
                                                                ? inFlightId
                                                                : undefined
                                                        }
                                                        aria-current={
                                                            section === current
                                                                ? 'page'
                                                                : undefined
                                                        }
                                                    >
                                                        <Icon />
                                                        <span>{title}</span>
                                                    </Link>
                                                </SidebarMenuButton>
                                                {section === 'traces' && (
                                                    <InFlightBadge
                                                        count={inFlight}
                                                        id={inFlightId}
                                                    />
                                                )}
                                            </SidebarMenuItem>
                                        ),
                                    )}
                                </SidebarMenu>
                            </SidebarGroupContent>
                        </SidebarGroup>
                    </nav>
                </SidebarContent>
                <SidebarFooter className="mt-4 flex-row items-center justify-between gap-2 border-t border-sidebar-border p-0 px-2.25 pt-4.25">
                    <div className="min-w-0">
                        <p className="truncate font-mono text-caption">
                            astrophp/trail
                        </p>
                        <p className="text-micro text-faint">
                            Open-source package
                        </p>
                    </div>
                    <ThemeToggle />
                </SidebarFooter>
            </div>
        </Sidebar>
    )
}
