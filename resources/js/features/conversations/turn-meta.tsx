import { Link } from 'react-router'
import type { Trace } from '@/api/types'
import { CostValue } from '@/components/telemetry/cost-value'
import { DurationValue } from '@/components/telemetry/duration-value'
import { TokenValue } from '@/components/telemetry/token-value'
import { Button } from '@/components/ui/button'
import { formatCount } from '@/lib/format'
import { tracePagePath } from '@/lib/trace-page-path'

function Fact({
    label,
    children,
}: {
    label: string
    children: React.ReactNode
}) {
    return (
        <span className="inline-flex items-baseline gap-1.5">
            <span className="text-faint">{label}</span>
            {children}
        </span>
    )
}

/** The quiet line under a turn: how long it took, its tokens and cost, its spans, and the way to its trace. */
export function TurnMeta({ trace, number }: { trace: Trace; number: number }) {
    return (
        <div
            data-slot="turn-meta"
            className="ms-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-caption text-muted-foreground"
        >
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <Fact label="Duration">
                    <DurationValue of={trace} />
                </Fact>
                <Fact label="Tokens">
                    <TokenValue usage={trace.usage} />
                </Fact>
                <Fact label="Cost">
                    <CostValue cost={trace.cost} />
                </Fact>
                <Fact label="Spans">
                    <span className="tabular-nums">
                        {formatCount(trace.span_count)}
                    </span>
                </Fact>
            </div>
            <Button asChild variant="link" size="xs">
                <Link
                    to={tracePagePath(trace.id)}
                    aria-label={`Inspect trace of turn ${formatCount(number)}`}
                >
                    Inspect trace
                </Link>
            </Button>
        </div>
    )
}
