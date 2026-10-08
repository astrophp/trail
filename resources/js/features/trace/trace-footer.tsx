import { BackLink } from '@/features/trace/back-link'
import { TraceStepper } from '@/features/trace/trace-stepper'
import { useBackLink } from '@/hooks/use-return-target'
import { cn } from '@/lib/utils'

/**
 * Under the workbench, in every view: the way back to the page the run was opened from, and (when
 * that was a list or a conversation) the steps to the runs or turns next to it.
 */
export function TraceFooter({
    traceId,
    className,
}: {
    traceId: string
    className?: string
}) {
    const { from, source } = useBackLink()

    return (
        <footer
            data-slot="trace-footer"
            className={cn(
                'flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t pt-4',
                className,
            )}
        >
            <BackLink className="-ms-2" />
            {from === null ? null : (
                <TraceStepper
                    traceId={traceId}
                    from={from}
                    within={source === 'conversation' ? 'conversation' : 'list'}
                />
            )}
        </footer>
    )
}
