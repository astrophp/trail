import {
    BotIcon,
    ChartColumnIcon,
    LayoutDashboardIcon,
    ListTreeIcon,
    MessageSquareIcon,
    type LucideIcon,
} from 'lucide-react'
import type { ReactElement } from 'react'
import { matchPath } from 'react-router'
import { NotFoundPage } from '@/pages/not-found-page'
import { PlaceholderPage } from '@/pages/placeholder-page'
import { TracesPage } from '@/pages/traces-page'

export type Section =
    'overview' | 'traces' | 'conversations' | 'agents' | 'usage'

export type RouteDef = {
    /** The route's path, relative to the dashboard's base path. */
    path: string
    title: string
    /** The navigation item this page belongs to; null when it belongs to none. */
    section: Section | null
    /** The path of the page this one sits under in the breadcrumb. */
    parent?: string
    /** Present on the pages that have a navigation item of their own. */
    icon?: LucideIcon
    /** The page itself. */
    element: ReactElement
}

/**
 * Every page of the dashboard. The router, the document title, the breadcrumb and
 * the current item in the navigation all read from this one list.
 */
export const routeTable: RouteDef[] = [
    {
        path: '/',
        title: 'Overview',
        element: <PlaceholderPage title="Overview" />,
        section: 'overview',
        icon: LayoutDashboardIcon,
    },
    {
        path: '/traces',
        title: 'Traces',
        element: <TracesPage />,
        section: 'traces',
        icon: ListTreeIcon,
    },
    {
        path: '/traces/:traceId',
        title: 'Trace',
        element: <PlaceholderPage title="Trace" />,
        section: 'traces',
        parent: '/traces',
    },
    {
        path: '/conversations',
        title: 'Conversations',
        element: <PlaceholderPage title="Conversations" />,
        section: 'conversations',
        icon: MessageSquareIcon,
    },
    {
        path: '/conversations/:conversationId',
        title: 'Conversation',
        element: <PlaceholderPage title="Conversation" />,
        section: 'conversations',
        parent: '/conversations',
    },
    {
        path: '/agents',
        title: 'Agents',
        element: <PlaceholderPage title="Agents" />,
        section: 'agents',
        icon: BotIcon,
    },
    {
        path: '/agents/:agent',
        title: 'Agent',
        element: <PlaceholderPage title="Agent" />,
        section: 'agents',
        parent: '/agents',
    },
    {
        path: '/usage',
        title: 'Usage & cost',
        element: <PlaceholderPage title="Usage & cost" />,
        section: 'usage',
        icon: ChartColumnIcon,
    },
]

export const notFoundRoute: RouteDef = {
    path: '*',
    title: 'Page not found',
    section: null,
    element: <NotFoundPage />,
}

export type NavItem = RouteDef & { section: Section; icon: LucideIcon }

/** The pages that have an item in the navigation, in order. */
export const navItems: NavItem[] = routeTable.filter(
    (route): route is NavItem =>
        route.icon !== undefined && route.section !== null,
)

/** The route that serves a path (relative to the base path); the not-found route when none does. */
export function resolveRoute(pathname: string): RouteDef {
    return (
        routeTable.find((route) =>
            matchPath({ path: route.path, end: true }, pathname),
        ) ?? notFoundRoute
    )
}

export type Crumb = {
    title: string
    /** Set on every crumb but the last: where it links to. */
    to?: string
}

/** The section above a detail page, then the page itself, as breadcrumbs. */
export function breadcrumbTrail(route: RouteDef): Crumb[] {
    const parent = routeTable.find(
        (candidate) => candidate.path === route.parent,
    )

    return parent
        ? [{ title: parent.title, to: parent.path }, { title: route.title }]
        : [{ title: route.title }]
}

/** The text of the browser tab for a route. */
export function documentTitle(route: RouteDef): string {
    return `${route.title} · Trail`
}
