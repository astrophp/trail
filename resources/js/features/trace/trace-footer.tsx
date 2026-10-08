import { BackLink } from '@/features/trace/back-link'
import { TraceStepper } from '@/features/trace/trace-stepper'
import { useBackLink } from '@/hooks/use-return-target'
import { cn } from '@/lib/utils'

/**
 * Under the workbench, in every view: the way back to the list, and (when the run was opened from
 * a list) the steps to the runs next to it.
 */
export function TraceFooter({
    traceId,
    className,
}: {
    traceId: string
    className?: string
}) {
    const { from } = useBackLink()

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
                <TraceStepper traceId={traceId} from={from} />
            )}
        </footer>
    )
}
