import {
    CircleCheckIcon,
    CircleHelpIcon,
    CircleMinusIcon,
    CircleXIcon,
    TriangleAlertIcon,
    type LucideIcon,
} from 'lucide-react'
import type { Coverage, CoverageState, SpanLimit } from '@/api/types'
import { KeyValue } from '@/components/patterns/key-value'
import { KeyValueList } from '@/components/patterns/key-value-list'
import { coverageItems, coverageSentence } from '@/features/trace/coverage-text'
import { RunPanel } from '@/features/trace/run-panel'
import { formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'

/** A shape and a colour per state, beside the words: the state never rests on colour alone. */
const marks: Record<CoverageState, { Icon: LucideIcon; tone: string }> = {
    captured: { Icon: CircleCheckIcon, tone: 'text-success' },
    partial: { Icon: TriangleAlertIcon, tone: 'text-warning' },
    not_captured: { Icon: CircleXIcon, tone: 'text-destructive' },
    not_applicable: { Icon: CircleMinusIcon, tone: 'text-muted-foreground' },
}

/** For a state this page does not know: a neutral mark, with the state's words beside it. */
const unknownMark = { Icon: CircleHelpIcon, tone: 'text-muted-foreground' }

type CaptureCoverageProps = {
    coverage: Coverage
    spanLimit: SpanLimit
}

/** How much of what the run should have recorded was recorded, item by item, as the server counted it. */
export function CaptureCoverage({ coverage, spanLimit }: CaptureCoverageProps) {
    return (
        <RunPanel title="Capture coverage">
            <KeyValueList layout="rows">
                {coverageItems.map(({ key, label }) => {
                    const item = coverage[key]
                    const { Icon, tone } = marks[item.state] ?? unknownMark

                    return (
                        <KeyValue key={key} label={label}>
                            <span className="flex items-start gap-2">
                                <Icon
                                    aria-hidden="true"
                                    className={cn(
                                        'mt-0.5 size-3.5 shrink-0',
                                        tone,
                                    )}
                                />
                                <span>{coverageSentence(key, item)}</span>
                            </span>
                        </KeyValue>
                    )
                })}
            </KeyValueList>
            {spanLimit.truncated ? (
                <p className="text-caption text-muted-foreground">
                    Coverage is counted over the first{' '}
                    {formatCount(spanLimit.limit)} spans.
                </p>
            ) : null}
        </RunPanel>
    )
}
