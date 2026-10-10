import { Link, useLocation } from 'react-router'
import { useContext } from 'react'
import { traceExportUrl } from '@/api/traces'
import { Button } from '@/components/ui/button'
import { SelectionContext } from '@/features/traces/selection-context'
import { useTraceList } from '@/features/traces/use-trace-list'
import { comparePath } from '@/lib/compare-path'
import { formatCount } from '@/lib/format'
import { returnTo } from '@/lib/return-context'
import { cn } from '@/lib/utils'

/** The most runs `GET /traces/export` takes in `ids`. */
const exportLimit = 100

/**
 * Above the table while runs are selected: what to do with them. Compare takes exactly two, in
 * the order they were selected, and is told the list view to come back to. The export asks for
 * the selected runs by id in the selection's range, whatever the filters are now.
 */
export function SelectionBar({ className }: { className?: string }) {
    const { ids, clear } = useContext(SelectionContext)
    const { view } = useTraceList()
    const { pathname, search } = useLocation()

    // Always mounted, so a change of its text is announced; the bar itself is not a live region.
    const status = (
        <span role="status" className="sr-only">
            {ids.length === 0
                ? ''
                : `${formatCount(ids.length)} ${ids.length === 1 ? 'run' : 'runs'} selected`}
        </span>
    )

    if (ids.length === 0) {
        return status
    }

    const [a, b] = ids
    const tooMany = ids.length > exportLimit
    const compare = new URLSearchParams({
        a,
        b,
        from: returnTo(pathname, search),
    })

    return (
        <>
            {status}
            <div
                data-slot="selection-bar"
                className={cn(
                    'flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl bg-primary-soft px-4 py-2.5 text-ui',
                    className,
                )}
            >
                {ids.length === 2 ? (
                    <Button asChild size="sm">
                        <Link to={`${comparePath}?${compare.toString()}`}>
                            Compare 2 traces
                        </Link>
                    </Button>
                ) : (
                    <p className="flex flex-wrap gap-x-3">
                        <span className="font-medium">
                            {formatCount(ids.length)} selected
                        </span>
                        <span className="text-muted-foreground">
                            {ids.length === 1
                                ? 'Select one more to compare'
                                : 'Compare needs exactly two'}
                        </span>
                    </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                    {tooMany ? (
                        <span
                            id="export-limit"
                            className="text-caption text-muted-foreground"
                        >
                            At most {exportLimit} runs can be exported at once.
                        </span>
                    ) : null}
                    {tooMany ? (
                        <Button
                            variant="outline"
                            size="sm"
                            disabled
                            aria-describedby="export-limit"
                        >
                            Export selection
                        </Button>
                    ) : (
                        <Button asChild variant="outline" size="sm">
                            <a
                                href={traceExportUrl({
                                    range: view.range,
                                    ids: ids.join(','),
                                })}
                                download
                            >
                                Export selection
                            </a>
                        </Button>
                    )}
                    <span className="text-caption text-muted-foreground">
                        Runs outside the time range are left out.
                    </span>
                    <Button variant="ghost" size="sm" onClick={clear}>
                        Clear
                    </Button>
                </div>
            </div>
        </>
    )
}
