import { cva, type VariantProps } from 'class-variance-authority'
import type { Trace } from '@/api/types'
import { RespondingModel } from '@/components/telemetry/responding-model'
import { cn } from '@/lib/utils'

const label = cva('', {
    variants: {
        layout: {
            stacked: 'flex flex-col',
            inline: 'flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5',
        },
    },
    defaultVariants: { layout: 'stacked' },
})

type ModelLabelProps = VariantProps<typeof label> & {
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
    /**
     * `stacked` puts the provider under the model, for a table cell; `inline` puts the provider
     * beside the model after a middle dot and wraps when the line is narrow, for a header.
     */
    className?: string
}

/**
 * The model of a run or a call, with its provider and whether it streamed. A part that was not
 * captured says so. When the model that answered differs from the one asked for, it is shown too.
 */
export function ModelLabel({
    of,
    expectResponding = false,
    layout,
    className,
}: ModelLabelProps) {
    const responding = of.responding_model
    const inline = layout === 'inline'
    const model =
        of.model === null ? (
            <span className="text-muted-foreground">Not captured</span>
        ) : (
            <span className="font-mono text-xs">{of.model}</span>
        )
    const provider = (
        <span
            className={cn(
                'text-caption text-muted-foreground',
                !inline && 'mt-1',
            )}
        >
            {of.provider ?? 'Not captured'}
            {of.streamed ? ' · streamed' : null}
        </span>
    )

    return (
        <div
            data-slot="model-label"
            role={inline ? 'group' : undefined}
            aria-label={inline ? 'Model and provider' : undefined}
            className={cn(label({ layout }), className)}
        >
            {inline ? (
                <span className="whitespace-nowrap">
                    {model}
                    <span
                        aria-hidden="true"
                        className="ms-1.5 text-caption text-muted-foreground"
                    >
                        ·
                    </span>
                </span>
            ) : (
                model
            )}
            {provider}
            <RespondingModel
                model={of.model}
                responding={responding}
                expected={expectResponding}
                className={inline ? undefined : 'mt-1'}
            />
        </div>
    )
}
