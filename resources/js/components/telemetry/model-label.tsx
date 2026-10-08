import type { Trace } from '@/api/types'
import { RespondingModel } from '@/components/telemetry/responding-model'
import { cn } from '@/lib/utils'

type ModelLabelProps = {
    /**
     * A span has no `streamed` of its own: left out, it shows nothing about streaming. A span
     * also has a `responding_model`; a run does not, and then none is shown.
     */
    of: Pick<Trace, 'provider' | 'model'> &
        Partial<Pick<Trace, 'streamed'>> & {
            responding_model?: string | null
        }
    /**
     * The call finished, so the provider should have said which model answered: when it did not
     * (a streamed run does not expose it), the label says so instead of staying silent.
     */
    expectResponding?: boolean
    className?: string
}

/**
 * The model of a run or a call, with its provider and whether it streamed. A part that was not
 * captured says so. When the model that answered differs from the one asked for, it is shown too.
 */
export function ModelLabel({
    of,
    expectResponding = false,
    className,
}: ModelLabelProps) {
    const responding = of.responding_model

    return (
        <div data-slot="model-label" className={cn('flex flex-col', className)}>
            {of.model === null ? (
                <span className="text-muted-foreground">Not captured</span>
            ) : (
                <span className="font-mono text-xs">{of.model}</span>
            )}
            <span className="mt-1 text-caption text-muted-foreground">
                {of.provider ?? 'Not captured'}
                {of.streamed ? ' · streamed' : null}
            </span>
            <RespondingModel
                model={of.model}
                responding={responding}
                expected={expectResponding}
                className="mt-1"
            />
        </div>
    )
}
