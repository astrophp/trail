import { Link } from 'react-router'
import { AgentIcon } from '@/components/telemetry/agent-icon'
import { TraceId } from '@/components/telemetry/trace-id'
import type { Side } from '@/features/compare/compare-side'

type CompareRunProps = {
    side: Side
    /** `A` or `B`. */
    name: string
    /** This comparison, as a `from` value, so the run leads back to it. */
    from: string
}

/** Which run a side is: its name, its id and the way into it. */
export function CompareRun({ side, name, from }: CompareRunProps) {
    const { trace } = side

    return (
        <div className="flex flex-col items-start gap-1">
            <span className="flex items-center gap-2 font-medium">
                <AgentIcon type={trace.type} />
                {trace.name}
            </span>
            <TraceId id={trace.id} />
            <Link
                to={`/traces/${encodeURIComponent(trace.id)}?${new URLSearchParams({ from }).toString()}`}
                className="text-primary-ink underline-offset-4 hover:underline"
            >
                Open trace {name}
            </Link>
        </div>
    )
}
