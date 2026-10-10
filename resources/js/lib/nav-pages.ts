import {
    BotIcon,
    ChartColumnIcon,
    LayoutDashboardIcon,
    ListTreeIcon,
    MessageSquareIcon,
    type LucideIcon,
} from 'lucide-react'

export type Section =
    'overview' | 'traces' | 'conversations' | 'agents' | 'usage'

export type NavPage = {
    section: Section
    /** The page's path, relative to the dashboard's base path. */
    path: string
    title: string
    icon: LucideIcon
}

/**
 * The pages that have an item of their own in the navigation, in order: what the sidebar lists and
 * the command palette offers. The route table takes the same entries, so a page is named once.
 */
export const navPages: NavPage[] = [
    {
        section: 'overview',
        path: '/',
        title: 'Overview',
        icon: LayoutDashboardIcon,
    },
    {
        section: 'traces',
        path: '/traces',
        title: 'Traces',
        icon: ListTreeIcon,
    },
    {
        section: 'conversations',
        path: '/conversations',
        title: 'Conversations',
        icon: MessageSquareIcon,
    },
    { section: 'agents', path: '/agents', title: 'Agents', icon: BotIcon },
    {
        section: 'usage',
        path: '/usage',
        title: 'Usage & cost',
        icon: ChartColumnIcon,
    },
]

/** The navigation page of a section. */
export function navPage(section: Section): NavPage {
    const found = navPages.find((page) => page.section === section)

    if (found === undefined) {
        throw new Error(`No navigation page for ${section}.`)
    }

    return found
}
