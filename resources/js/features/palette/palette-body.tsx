import { LinkIcon, SunMoonIcon } from 'lucide-react'
import { useLocation, type To } from 'react-router'
import { failureMessage } from '@/api/client'
import { searchMinimum } from '@/api/search'
import {
    CommandPaletteFooter,
    CommandPaletteGroup,
    CommandPaletteHint,
    CommandPaletteInput,
    CommandPaletteItem,
    CommandPaletteLink,
    CommandPaletteList,
    CommandPaletteRow,
    CommandPaletteStatus,
} from '@/components/patterns/command-palette'
import { useCopyLink } from '@/components/patterns/copy-link-button'
import { Button } from '@/components/ui/button'
import { SearchGroups } from '@/features/palette/search-groups'
import {
    usePaletteSearch,
    type PaletteSearch,
} from '@/features/palette/use-palette-search'
import { useTheme } from '@/hooks/use-theme'
import { useTimeRange } from '@/hooks/use-time-range'
import { navPages } from '@/lib/nav-pages'
import { normalizeSearch } from '@/lib/search'
import { timeRangeLabels } from '@/lib/time-range'
import type { SearchResponse } from '@/api/types'

type PaletteBodyProps = {
    /** What is typed in the search row. */
    text: string
    /** Chooses an option with the keyboard: go there and close. */
    go: (to: To) => void
    /** A plain click on an option's link went there: close. */
    followed: () => void
    /** An action was run: close. */
    close: () => void
}

const matches = (label: string, needle: string) =>
    label.toLowerCase().includes(needle)

/** The rows of a search, in the sentence that counts them. */
const resultCount = (response: SearchResponse) =>
    response.data.traces.length +
    response.data.conversations.length +
    response.data.agents.length

const nouns = {
    traces: ['run', 'runs'],
    conversations: ['conversation', 'conversations'],
    agents: ['agent', 'agents'],
} as const

const listOf = (items: string[]) =>
    items.length < 2
        ? items.join('')
        : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`

/**
 * The answer in words. The API says only whether more than the limit matched, never how many, so
 * a total is stated only when nothing was cut; otherwise the sentence says what is shown and which
 * groups have more.
 */
function resultsSentence(response: SearchResponse, query: string): string {
    const groups = (['traces', 'conversations', 'agents'] as const)
        .map((key) => ({
            key,
            count: response.data[key].length,
            more: response.limits[key].truncated,
        }))
        .filter(({ count }) => count > 0)
    const total = groups.reduce((sum, { count }) => sum + count, 0)

    if (total === 0) {
        return `No runs, conversations or agents match “${query}”.`
    }

    if (!groups.some(({ more }) => more)) {
        return `${total} ${total === 1 ? 'result' : 'results'} for “${query}”.`
    }

    const shown = groups.map(
        ({ key, count }) => `${count} ${nouns[key][count === 1 ? 0 : 1]}`,
    )
    const cut = groups
        .filter(({ more }) => more)
        .map(({ key }) => nouns[key][1])

    return `Showing ${listOf(shown)}; more ${listOf(cut)} match.`
}

/** What the search is doing, as one sentence: a new sentence for each text, so each answer is announced once. */
function statusSentence(search: PaletteSearch, query: string): string | null {
    switch (search.phase) {
        case 'loading':
            return 'Searching…'
        case 'failed':
            return `The search could not be completed. ${failureMessage(search.error)}`
        case 'ready':
            return resultsSentence(search.response, query)
        case 'idle':
            return Array.from(query).length > 0 &&
                Array.from(query).length < searchMinimum
                ? `Type at least ${searchMinimum} characters to search runs, conversations and agents.`
                : null
    }
}

/** Which period the text matches were bounded by, as the response states it. */
function rangeLine(range: SearchResponse['range']): string {
    const period =
        range.preset === null
            ? 'the period searched'
            : `the ${timeRangeLabels[range.preset].toLowerCase()}`

    return `Text matches from ${period}. An id finds a run from any time.`
}

/**
 * What the open palette holds: the pages and actions that match the text (no request), and below
 * them what `GET /api/search` found for it. It exists only while the palette is open, so closing
 * it ends its request and forgets its state.
 */
export function PaletteBody({ text, go, followed, close }: PaletteBodyProps) {
    const [range] = useTimeRange()
    const query = normalizeSearch(text)
    const search = usePaletteSearch(query, range)
    const needle = query.toLowerCase()
    const pages = navPages.filter((page) => matches(page.title, needle))
    const sentence = statusSentence(search, query)

    return (
        <>
            <CommandPaletteInput placeholder="Search runs, conversations and agents…" />
            <CommandPaletteList label="Results">
                {pages.length === 0 ? null : (
                    <CommandPaletteGroup heading="Pages">
                        {pages.map(({ path, title, icon: Icon }) => (
                            <CommandPaletteItem
                                key={path}
                                value={`page:${path}`}
                                onSelect={() => go(path)}
                            >
                                <CommandPaletteLink
                                    to={path}
                                    onFollow={followed}
                                >
                                    <CommandPaletteRow
                                        icon={<Icon />}
                                        meta="Page"
                                    >
                                        {title}
                                    </CommandPaletteRow>
                                </CommandPaletteLink>
                            </CommandPaletteItem>
                        ))}
                    </CommandPaletteGroup>
                )}
                <ActionGroup needle={needle} close={close} />
                {search.phase === 'ready' ? (
                    <SearchGroups
                        response={search.response}
                        range={range}
                        go={go}
                        followed={followed}
                    />
                ) : null}
            </CommandPaletteList>
            <CommandPaletteStatus
                spokenOnly={
                    search.phase === 'ready' && resultCount(search.response) > 0
                }
                action={
                    search.phase === 'failed' ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={search.retry}
                        >
                            Try again
                        </Button>
                    ) : undefined
                }
            >
                {sentence}
            </CommandPaletteStatus>
            <CommandPaletteFooter>
                <CommandPaletteHint keys={['↑', '↓']}>
                    navigate
                </CommandPaletteHint>
                <CommandPaletteHint keys={['enter']}>open</CommandPaletteHint>
                {search.phase === 'ready' ? (
                    <span className="w-full">
                        {rangeLine(search.response.range)}
                    </span>
                ) : null}
            </CommandPaletteFooter>
        </>
    )
}

/** The small actions that need no confirmation, filtered by the text like the pages. */
function ActionGroup({ needle, close }: { needle: string; close: () => void }) {
    const { resolvedTheme, setTheme } = useTheme()
    const { pathname, search } = useLocation()
    const copyLink = useCopyLink(`${pathname}${search}`)
    const actions = [
        {
            value: 'action:theme',
            label: 'Toggle theme',
            keywords: 'dark light appearance',
            icon: <SunMoonIcon />,
            run: () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'),
        },
        {
            value: 'action:copy-link',
            label: 'Copy link to this page',
            keywords: 'url address share',
            icon: <LinkIcon />,
            run: () => void copyLink(),
        },
    ].filter(
        ({ label, keywords }) =>
            matches(label, needle) || matches(keywords, needle),
    )

    if (actions.length === 0) {
        return null
    }

    return (
        <CommandPaletteGroup heading="Actions">
            {actions.map(({ value, label, icon, run }) => (
                <CommandPaletteItem
                    key={value}
                    value={value}
                    onSelect={() => {
                        run()
                        close()
                    }}
                >
                    <CommandPaletteRow icon={icon} meta="Action">
                        {label}
                    </CommandPaletteRow>
                </CommandPaletteItem>
            ))}
        </CommandPaletteGroup>
    )
}
