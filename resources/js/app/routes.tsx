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
import { agentPagePath } from '@/lib/agent-path'
import { comparePath } from '@/lib/compare-path'
import { transcriptPath } from '@/lib/conversation-path'
import { AgentPage } from '@/pages/agent-page'
import { AgentsPage } from '@/pages/agents-page'
import { ComparePage } from '@/pages/compare-page'
import { ConversationPage } from '@/pages/conversation-page'
import { ConversationsPage } from '@/pages/conversations-page'
import { NotFoundPage } from '@/pages/not-found-page'
import { OverviewPage } from '@/pages/overview-page'
import { TracePage } from '@/pages/trace-page'
import { TracesPage } from '@/pages/traces-page'
import { UsagePage } from '@/pages/usage-page'

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
        element: <OverviewPage />,
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
        // Before the run page, so `compare` is never read as a run's id.
        path: comparePath,
        title: 'Compare',
        element: <ComparePage />,
        section: 'traces',
        parent: '/traces',
    },
    {
        path: '/traces/:traceId',
        title: 'Trace',
        element: <TracePage />,
        section: 'traces',
        parent: '/traces',
    },
    {
        path: '/conversations',
        title: 'Conversations',
        element: <ConversationsPage />,
        section: 'conversations',
        icon: MessageSquareIcon,
    },
    {
        path: transcriptPath,
        title: 'Conversation',
        element: <ConversationPage />,
        section: 'conversations',
        parent: '/conversations',
    },
    {
        path: '/agents',
        title: 'Agents',
        element: <AgentsPage />,
        section: 'agents',
        icon: BotIcon,
    },
    {
        // The agent's name travels in the query, so one path serves every name.
        path: agentPagePath,
        title: 'Agent',
        element: <AgentPage />,
        section: 'agents',
        parent: '/agents',
    },
    {
        path: '/usage',
        title: 'Usage & cost',
        element: <UsagePage />,
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

/**
 * The section above a detail page, then the page itself, as breadcrumbs. A page that has named
 * itself (`title`) is called that instead of by its route's title.
 */
export function breadcrumbTrail(
    route: RouteDef,
    title: string | null = null,
): Crumb[] {
    const parent = routeTable.find(
        (candidate) => candidate.path === route.parent,
    )

    return parent
        ? [
              { title: parent.title, to: parent.path },
              { title: title ?? route.title },
          ]
        : [{ title: title ?? route.title }]
}

/** The text of the browser tab for a route, or for the name the page gave itself. */
export function documentTitle(
    route: RouteDef,
    title: string | null = null,
): string {
    return `${title ?? route.title} · Trail`
}
