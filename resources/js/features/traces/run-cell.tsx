import { useLocation } from 'react-router'
import type { Trace } from '@/api/types'
import { RowLink } from '@/components/patterns/row-link'
import { AgentIcon } from '@/components/telemetry/agent-icon'
import { TraceId } from '@/components/telemetry/trace-id'
import { SelectRow } from '@/features/traces/select-row'
import { returnTo } from '@/lib/return-context'

/**
 * Who ran, what it was asked, and which run it is. A checkbox selects it, and the name leads to the
 * run, which is told the whole view of the list it was opened from (range, filters, sort and page)
 * in `from`. The bookmark is not here: it is the row's last cell, apart from the checkbox.
 */
export function RunCell({ trace }: { trace: Trace }) {
    const { pathname, search } = useLocation()
    const from = new URLSearchParams({ from: returnTo(pathname, search) })

    return (
        // The gap is the header's own: the agent icon sits under the column's label.
        <div className="flex max-w-55 min-w-0 items-start gap-4 md:max-w-67.5">
            <SelectRow trace={trace} />
            <div className="flex min-w-0 flex-col gap-1 leading-normal">
                <div className="flex min-w-0 items-center gap-2">
                    <AgentIcon type={trace.type} />
                    <RowLink
                        to={`/traces/${encodeURIComponent(trace.id)}?${from.toString()}`}
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
