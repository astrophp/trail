import { useQueryClient } from '@tanstack/react-query'
import { RefreshCwIcon } from 'lucide-react'
import {
    useCallback,
    useEffect,
    useReducer,
    useState,
    useSyncExternalStore,
} from 'react'
import { Button } from '@/components/ui/button'
import { useBoot } from '@/hooks/use-boot'
import {
    formatDateTime,
    formatRelativeTime,
    resolveTimeZone,
} from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * The oldest successful data update among the active queries that have data; 0 when none does.
 * The oldest, because that is how old the staleest thing on screen is: the meta poll alone
 * would otherwise keep the label fresh while a table is minutes old.
 */
function useLastUpdate(): number {
    const cache = useQueryClient().getQueryCache()
    const subscribe = useCallback(
        (notify: () => void) => cache.subscribe(notify),
        [cache],
    )

    return useSyncExternalStore(subscribe, () => {
        const times = cache
            .findAll({ type: 'active' })
            .map((query) => query.state.dataUpdatedAt)
            .filter((time) => time > 0)

        return times.length === 0 ? 0 : Math.min(...times)
    })
}

/** How often the text moves on: the formatter's finest step is a second, but nobody reads that. */
const tickEvery = 10_000

/**
 * "Updated 2m ago". Its own component with its own clock, so only this text re-renders as time
 * passes. It is plain text, not a live region: it never announces itself. With nothing to show
 * there is no clock.
 */
function UpdatedAgo({ at }: { at: number }) {
    const timeZone = resolveTimeZone(useBoot().timezone)
    const [, tick] = useReducer((count: number) => count + 1, 0)

    const ticking = at !== 0

    useEffect(() => {
        if (!ticking) {
            return
        }

        const timer = setInterval(tick, tickEvery)

        return () => clearInterval(timer)
    }, [ticking])

    if (!ticking) {
        return null
    }

    const date = new Date(at)

    return (
        <time
            dateTime={date.toISOString()}
            title={formatDateTime(date, timeZone)}
            // On a phone the button stays and the words go.
            className="hidden text-caption text-muted-foreground tabular-nums xs:inline"
        >
            Updated {formatRelativeTime(date, new Date())}
        </time>
    )
}

/**
 * Fetches the data on screen again, for every page, and says how old it is. Invalidating (rather
 * than refetching the active queries only) also marks the cached queries of pages that are not
 * open as stale, so going back to one does not show data from before the press.
 */
export function RefreshControl() {
    const queryClient = useQueryClient()
    // Busy from the press until what it asked for has settled; the background poll never shows.
    const [refreshing, setRefreshing] = useState(false)
    const lastUpdate = useLastUpdate()

    return (
        <div className="flex items-center gap-1.5">
            <UpdatedAgo at={lastUpdate} />
            <Button
                variant="ghost"
                size="icon"
                aria-label="Refresh"
                aria-busy={refreshing || undefined}
                onClick={() => {
                    setRefreshing(true)
                    void queryClient
                        .invalidateQueries()
                        .finally(() => setRefreshing(false))
                }}
            >
                <RefreshCwIcon
                    aria-hidden="true"
                    className={cn(
                        'size-4',
                        refreshing && 'motion-safe:animate-spin',
                    )}
                />
            </Button>
        </div>
    )
}
