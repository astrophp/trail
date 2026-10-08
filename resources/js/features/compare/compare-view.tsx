import { GitCompareIcon } from 'lucide-react'
import { useLocation } from 'react-router'
import type { UseQueryResult } from '@tanstack/react-query'
import type { TraceDetailResponse } from '@/api/types'
import { skeletonBarClass } from '@/components/patterns/data-table'
import { EmptyState } from '@/components/patterns/empty-state'
import { PageHeader } from '@/components/patterns/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { BackToTraces } from '@/features/compare/back-to-traces'
import { CompareRow } from '@/features/compare/compare-row'
import { CompareRun } from '@/features/compare/compare-run'
import { compareRows } from '@/features/compare/compare-rows'
import { canCompare } from '@/features/compare/compare-params'
import { sideOf } from '@/features/compare/compare-side'
import { UnavailableRun } from '@/features/compare/unavailable-run'
import { returnTo } from '@/lib/return-context'
import { cn } from '@/lib/utils'

type Run = UseQueryResult<TraceDetailResponse>

type CompareViewProps = {
    /** The ids in the URL. */
    ids: { a: string; b: string }
    /** The two runs, loaded by the page; nothing is asked for unless the ids can be compared. */
    runs: { a: Run; b: Run }
    className?: string
}

/**
 * Two runs side by side, one row per attribute. A row is marked when what both sides show is
 * present and not the same; no value is computed from another. Each column has its own state:
 * loading, not found or failed, while the other still shows.
 */
export function CompareView({ ids, runs, className }: CompareViewProps) {
    const { pathname, search } = useLocation()
    const from = returnTo(pathname, search)
    const a = runs.a.data ? sideOf(runs.a.data) : undefined
    const b = runs.b.data ? sideOf(runs.b.data) : undefined
    // The attribute rows of a column that has no run: bars while it loads, else it says so.
    const waiting = (run: Run) =>
        run.isPending ? (
            <Skeleton className={cn(skeletonBarClass, 'h-4 w-20')} />
        ) : (
            <span className="text-muted-foreground">Unavailable</span>
        )
    // The spans of a run that is running still change, and those of a long run are only counted
    // as far as they came back: neither side's counts are put against the other's.
    const unsettled =
        a?.trace.status === 'running' || b?.trace.status === 'running'
    const incomplete = a?.truncated || b?.truncated

    return (
        <div className={className}>
            <PageHeader
                title="Compare traces"
                description="A row is marked when both runs have a value and the two differ. Durations, tokens and cost are shown side by side and never compared."
            >
                <BackToTraces />
            </PageHeader>
            {canCompare(ids.a, ids.b) ? (
                <div className="mt-5.75 overflow-hidden rounded-xl border bg-card text-card-foreground lg:mt-6.5">
                    <div
                        aria-hidden="true"
                        className="hidden gap-6 border-b bg-muted px-4 py-2.75 text-caption font-medium text-muted-foreground md:grid md:grid-cols-5"
                    >
                        <span />
                        <span className="col-span-2">Run A</span>
                        <span className="col-span-2">Run B</span>
                    </div>
                    <dl
                        aria-busy={runs.a.isPending || runs.b.isPending}
                        className="divide-y"
                    >
                        <CompareRow
                            label="Run"
                            a={
                                a ? (
                                    <CompareRun side={a} name="A" from={from} />
                                ) : (
                                    <UnavailableRun run={runs.a} />
                                )
                            }
                            b={
                                b ? (
                                    <CompareRun side={b} name="B" from={from} />
                                ) : (
                                    <UnavailableRun run={runs.b} />
                                )
                            }
                        />
                        {compareRows.map((row) => {
                            const left = a && row.key?.(a)
                            const right = b && row.key?.(b)

                            return (
                                <CompareRow
                                    key={row.label}
                                    label={row.label}
                                    a={a ? row.cell(a) : waiting(runs.a)}
                                    b={b ? row.cell(b) : waiting(runs.b)}
                                    differs={
                                        left != null &&
                                        right != null &&
                                        left !== right &&
                                        !(row.structure && unsettled) &&
                                        !(row.partial && incomplete)
                                    }
                                />
                            )
                        })}
                    </dl>
                </div>
            ) : (
                <EmptyState
                    icon={GitCompareIcon}
                    title="Choose two different runs to compare"
                    description="Tick two runs in the Traces list and press Compare."
                    className="mt-5.75 rounded-xl border bg-card lg:mt-6.5"
                />
            )}
        </div>
    )
}
