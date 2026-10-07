import type { Trace } from '@/api/types'
import { cn } from '@/lib/utils'

type ModelLabelProps = {
    of: Pick<Trace, 'provider' | 'model' | 'streamed'>
    className?: string
}

/** The model of a run, with its provider and whether it streamed. A part that was not captured says so. */
export function ModelLabel({ of, className }: ModelLabelProps) {
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
        </div>
    )
}
