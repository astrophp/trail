import { RotateCwIcon, TriangleAlertIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyTitle,
} from '@/components/ui/empty'
import { cn } from '@/lib/utils'

type PanelErrorProps = {
    /** What went wrong, in a sentence. */
    message: string
    title?: string
    /** Shows a button that calls it, with no arguments. */
    onRetry?: () => void
    /** What the button says. */
    retryLabel?: string
    className?: string
}

/** A `Panel` whose content could not be loaded. It is an alert, so it is announced when it appears. */
export function PanelError({
    message,
    title = 'Something went wrong',
    onRetry,
    retryLabel = 'Try again',
    className,
}: PanelErrorProps) {
    return (
        <Empty
            role="alert"
            data-slot="panel-error"
            className={cn('px-4 py-8', className)}
        >
            <EmptyHeader className="gap-1">
                <EmptyTitle className="flex items-center gap-1.5 text-ui">
                    <TriangleAlertIcon
                        aria-hidden="true"
                        className="size-4 text-destructive"
                    />
                    {title}
                </EmptyTitle>
                <EmptyDescription className="text-ui">
                    {message}
                </EmptyDescription>
            </EmptyHeader>
            {onRetry ? (
                <EmptyContent>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onRetry()}
                    >
                        <RotateCwIcon aria-hidden="true" />
                        {retryLabel}
                    </Button>
                </EmptyContent>
            ) : null}
        </Empty>
    )
}
