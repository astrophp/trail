import type { SpanType } from '@/api/types'
import { InfoHint } from '@/components/patterns/info-hint'
import { timingBarColours } from '@/components/telemetry/timing-bar'
import type { SpanTree } from '@/features/trace/build-span-tree'
import { cn } from '@/lib/utils'

/** The kinds of work a bar can show, in the order the legend lists them, and the types each covers. */
const kinds: { label: string; types: SpanType[] }[] = [
    { label: 'Agent run', types: ['agent'] },
    { label: 'Model step', types: ['step'] },
    { label: 'Tool call', types: ['tool'] },
    {
        label: 'Retrieval',
        types: ['embedding', 'classification', 'reranking'],
    },
    { label: 'Media', types: ['image', 'audio', 'transcription'] },
]

type TimingLegendProps = {
    tree: SpanTree
    /** The run's time axis; without one there are no bars to explain. */
    axisMs: number | null
    className?: string
}

/**
 * What the colours of the bars mean, for the kinds of work this run holds (and failure, when a
 * span failed), and that the bars are drawn in time relative to the run's start.
 */
export function TimingLegend({ tree, axisMs, className }: TimingLegendProps) {
    if (axisMs === null) {
        return null
    }

    const present = new Set(tree.nodes.map((node) => node.span.type))
    const failed = tree.nodes.some((node) => node.span.status === 'failed')
    const shown = kinds.filter((kind) =>
        kind.types.some((type) => present.has(type)),
    )

    return (
        <div
            data-slot="timing-legend"
            className={cn('flex items-center gap-x-3', className)}
        >
            {/* The colours explain the bars, which are drawn from md up; the hint is for every width. */}
            <ul
                aria-label="Bar colours"
                className="hidden flex-wrap items-center gap-x-3 gap-y-1 md:flex"
            >
                {shown.map((kind) => (
                    <li key={kind.label} className="flex items-center gap-1.5">
                        <span
                            aria-hidden="true"
                            className={cn(
                                'h-2.5 w-3.5 rounded-sm',
                                timingBarColours[kind.types[0]],
                            )}
                        />
                        {kind.label}
                    </li>
                ))}
                {failed ? (
                    <li className="flex items-center gap-1.5">
                        <span
                            aria-hidden="true"
                            className="h-2.5 w-3.5 rounded-l-sm border-r-2 border-foreground bg-destructive"
                        />
                        Failed
                    </li>
                ) : null}
                <li>· Relative time</li>
            </ul>
            <InfoHint label="About the timeline">
                Bars are placed from the run&rsquo;s start. A parent&rsquo;s bar
                and duration include its children.
            </InfoHint>
        </div>
    )
}
