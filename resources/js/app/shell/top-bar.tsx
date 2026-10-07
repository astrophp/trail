import { SearchIcon } from 'lucide-react'
import { Fragment, type Ref } from 'react'
import { Link, useLocation } from 'react-router'
import { breadcrumbTrail, resolveRoute } from '@/app/routes'
import { RefreshControl } from '@/app/shell/refresh-control'
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar'
import { useBoot } from '@/hooks/use-boot'
import { useTimeRangeLink } from '@/hooks/use-time-range'

export function TopBar({ triggerRef }: { triggerRef: Ref<HTMLButtonElement> }) {
    const boot = useBoot()
    const { pathname } = useLocation()
    const { openMobile } = useSidebar()
    const linkTo = useTimeRangeLink()
    const trail = breadcrumbTrail(resolveRoute(pathname))

    return (
        <header className="sticky top-0 z-10 flex h-13.5 shrink-0 items-center justify-between gap-4 border-b bg-background px-3.75 xs:px-4.5 md:h-14.25 md:px-5.75 wide:px-6.5 roomy:px-8">
            <div className="flex min-w-0 items-center gap-2.5">
                <SidebarTrigger
                    ref={triggerRef}
                    aria-label="Open navigation"
                    aria-expanded={openMobile}
                    className="md:hidden"
                />
                <Breadcrumb className="min-w-0">
                    <BreadcrumbList className="flex-nowrap gap-2.5 text-caption md:text-xs">
                        <BreadcrumbItem className="hidden md:inline-flex">
                            <span className="truncate">
                                {boot.appName ?? 'Laravel application'}
                            </span>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator className="hidden md:list-item">
                            /
                        </BreadcrumbSeparator>
                        {trail.map((crumb, index) => (
                            <Fragment key={crumb.title}>
                                {index > 0 ? (
                                    <BreadcrumbSeparator>/</BreadcrumbSeparator>
                                ) : null}
                                <BreadcrumbItem className="min-w-0">
                                    {crumb.to ? (
                                        <BreadcrumbLink asChild>
                                            <Link to={linkTo(crumb.to)}>
                                                {crumb.title}
                                            </Link>
                                        </BreadcrumbLink>
                                    ) : (
                                        <BreadcrumbPage className="truncate">
                                            {crumb.title}
                                        </BreadcrumbPage>
                                    )}
                                </BreadcrumbItem>
                            </Fragment>
                        ))}
                    </BreadcrumbList>
                </Breadcrumb>
            </div>
            <div className="flex shrink-0 items-center gap-1">
                <RefreshControl />
                {/* Not wired up yet, so it is disabled rather than a control that does nothing. */}
                <Button variant="ghost" disabled aria-label="Search">
                    <SearchIcon className="size-4" />
                    <Kbd className="hidden h-auto min-w-0 rounded-sm border bg-transparent px-1.25 py-px text-micro font-normal wide:inline-flex">
                        ⌘ K
                    </Kbd>
                </Button>
            </div>
        </header>
    )
}
