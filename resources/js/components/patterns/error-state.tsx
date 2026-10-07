import { RotateCwIcon, TriangleAlertIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from '@/components/ui/empty'
import { cn } from '@/lib/utils'

type ErrorStateProps = {
    title?: string
    /**
     * Whatever was thrown, read by its shape. An object with a `status` of `null` is a request
     * that got no response (the shape of the dashboard's `ApiError`). Otherwise a non-empty string
     * `message` is shown, and an integer `status` from 400 to 599 is shown as "Error 503".
     * Anything else gets a generic sentence. Never a stack trace.
     */
    error: unknown
    /** Shows a "Try again" button that calls it, with no arguments. */
    onRetry?: () => void
    /**
     * The retry is running. The button stays where it is and keeps focus, says so, and does
     * nothing when pressed.
     */
    retrying?: boolean
    className?: string
}

const noResponse =
    'The server could not be reached. Check the connection and try again.'
const generic = 'Something unexpected happened.'

function readFailure(error: unknown): { text: string; code: string | null } {
    if (typeof error !== 'object' || error === null) {
        return { text: generic, code: null }
    }

    const { message, status } = error as Record<string, unknown>

    if (status === null) {
        return { text: noResponse, code: null }
    }

    const isHttpError =
        typeof status === 'number' &&
        Number.isInteger(status) &&
        status >= 400 &&
        status <= 599

    return {
        text:
            typeof message === 'string' && message.trim() !== ''
                ? message
                : generic,
        code: isHttpError ? `Error ${status}` : null,
    }
}

/**
 * What a failure looks like: a readable message, the HTTP status when there is one, and a way
 * to try again. It is an alert, so it is announced when it appears.
 */
export function ErrorState({
    title = 'Something went wrong',
    error,
    onRetry,
    retrying = false,
    className,
}: ErrorStateProps) {
    const { text, code } = readFailure(error)

    return (
        <Empty
            role="alert"
            data-slot="error-state"
            className={cn('rounded-xl border bg-card px-6 py-12', className)}
        >
            <EmptyHeader className="gap-1.5">
                <EmptyMedia
                    variant="icon"
                    className="mb-1.5 size-10 rounded-lg border bg-muted text-destructive [&_svg:not([class*='size-'])]:size-5"
                >
                    <TriangleAlertIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle
                    role="heading"
                    aria-level={2}
                    className="text-heading"
                >
                    {title}
                </EmptyTitle>
                <EmptyDescription className="text-ui">{text}</EmptyDescription>
                {code ? (
                    <p className="text-caption text-muted-foreground tabular-nums">
                        {code}
                    </p>
                ) : null}
            </EmptyHeader>
            {onRetry ? (
                <EmptyContent>
                    <Button
                        variant="outline"
                        size="sm"
                        // Not `disabled`: it keeps focus, so a keyboard user is not thrown out.
                        aria-disabled={retrying || undefined}
                        onClick={() => {
                            if (!retrying) {
                                onRetry()
                            }
                        }}
                        className="aria-disabled:opacity-50"
                    >
                        <RotateCwIcon
                            aria-hidden="true"
                            className={
                                retrying
                                    ? 'motion-safe:animate-spin'
                                    : undefined
                            }
                        />
                        {retrying ? 'Trying again…' : 'Try again'}
                    </Button>
                </EmptyContent>
            ) : null}
        </Empty>
    )
}
