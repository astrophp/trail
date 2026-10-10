import { cn } from '@/lib/utils'

type RespondingModelProps = {
    /** The model that was asked for. */
    model: string | null
    /** The model the provider says answered; `undefined` for something that has none to report. */
    responding?: string | null
    /**
     * The call finished, so the provider should have said which model answered: when it did not
     * (a streamed run does not expose it), the note says so instead of staying silent.
     */
    expected?: boolean
    className?: string
}

/**
 * Which model answered, when that is worth saying: it differs from the one asked for, or it was
 * expected and not captured. Nothing when the answering model is the requested one.
 */
export function RespondingModel({
    model,
    responding,
    expected = false,
    className,
}: RespondingModelProps) {
    if (typeof responding === 'string' && responding !== model) {
        return (
            <span
                data-slot="responding-model"
                className={cn(
                    'text-caption whitespace-nowrap text-muted-foreground',
                    className,
                )}
            >
                Responded as{' '}
                <span className="font-mono text-xs text-foreground">
                    {responding}
                </span>
            </span>
        )
    }

    if ((responding === null || responding === undefined) && expected) {
        return (
            <span
                data-slot="responding-model"
                className={cn('text-caption text-muted-foreground', className)}
            >
                Responding model not captured
            </span>
        )
    }

    return null
}
