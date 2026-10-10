import { useLocation } from 'react-router'
import type { Trace } from '@/api/types'
import { RowLink } from '@/components/patterns/row-link'
import { AgentIcon } from '@/components/telemetry/agent-icon'
import { TraceId } from '@/components/telemetry/trace-id'
import { SelectRow } from '@/features/traces/select-row'
import { returnTo } from '@/lib/return-context'

type RunCellProps = {
    trace: Trace
    /** A checkbox selects the run. Left off where the rows are not a selectable list. */
    selectable?: boolean
    /**
     * The page the run is opened from, as a `from` value (see `returnTo`): the page the run's page
     * leads back to. The page the cell is on when left out.
     */
    from?: string
}

/**
 * Who ran, what it was asked, and which run it is. A checkbox selects it, and the name leads to the
 * run, which is told the whole view of the page it was opened from (for the list: range, filters,
 * sort and page) in `from`. The bookmark is not here: it is the row's last cell, apart from the
 * checkbox.
 */
export function RunCell({ trace, selectable = true, from }: RunCellProps) {
    const { pathname, search } = useLocation()
    const back = new URLSearchParams({
        from: from ?? returnTo(pathname, search),
    })

    return (
        // The gap is the header's own: the agent icon sits under the column's label.
        <div className="flex max-w-55 min-w-0 items-start gap-4 md:max-w-67.5">
            {selectable ? <SelectRow trace={trace} /> : null}
            <div className="flex min-w-0 flex-col gap-1 leading-normal">
                <div className="flex min-w-0 items-center gap-2">
                    <AgentIcon type={trace.type} />
                    <RowLink
                        to={`/traces/${encodeURIComponent(trace.id)}?${back.toString()}`}
                        className="truncate"
                    >
                        {trace.name}
                    </RowLink>
                </div>
                {trace.prompt_excerpt === null ? null : (
                    <p
                        title={trace.prompt_excerpt}
                        className="mt-1 truncate text-caption leading-normal text-muted-foreground"
                    >
                        {trace.prompt_excerpt}
                    </p>
                )}
                <TraceId id={trace.id} className="leading-normal" />
            </div>
        </div>
    )
}
