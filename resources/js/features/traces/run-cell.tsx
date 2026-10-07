import type { Trace } from '@/api/types'
import { RowLink } from '@/components/patterns/row-link'
import { AgentIcon } from '@/components/telemetry/agent-icon'
import { TraceId } from '@/components/telemetry/trace-id'
import { useTimeRangeLink } from '@/hooks/use-time-range'

/** Who ran, what it was asked, and which run it is. The name leads to the run. */
export function RunCell({ trace }: { trace: Trace }) {
    const linkTo = useTimeRangeLink()

    return (
        <div className="flex max-w-50 min-w-0 flex-col gap-1 leading-normal md:max-w-62.5">
            <div className="flex min-w-0 items-center gap-2">
                <AgentIcon type={trace.type} />
                <RowLink
                    to={linkTo(`/traces/${trace.id}`)}
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
    )
}
