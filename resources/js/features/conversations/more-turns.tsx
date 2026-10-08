import { RotateCwIcon } from 'lucide-react'
import { Notice } from '@/components/patterns/notice'
import { Button } from '@/components/ui/button'
import { formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'

type MoreTurnsProps = {
    /** Which side of the turns shown the others are on. */
    direction: 'earlier' | 'later'
    /** How many turns lie that way: the database's count, not the length of any list. */
    count: number
    loading: boolean
    /** A load failed; the turns already shown stay. `null` when none did. */
    failure: { error: unknown } | null
    onLoad: () => void
    className?: string
}

function reason(error: unknown): string | undefined {
    return error instanceof Error && error.message !== ''
        ? error.message
        : undefined
}

/**
 * The way to the turns before the first one shown, or after the last. It is offered only while
 * there are some, and says how many. A failed load is said above the button, which stays where it
 * is (and keeps focus) and becomes the retry.
 */
export function MoreTurns({
    direction,
    count,
    loading,
    failure,
    onLoad,
    className,
}: MoreTurnsProps) {
    if (count <= 0) {
        return null
    }

    return (
        <div
            data-slot={`${direction}-turns`}
            className={cn('flex flex-col items-start gap-3', className)}
        >
            {failure === null ? null : (
                <Notice
                    tone="danger"
                    title={`${direction === 'earlier' ? 'Earlier' : 'Later'} turns could not be loaded`}
                    className="w-full"
                >
                    {reason(failure.error)}
                </Notice>
            )}
            <Button
                type="button"
                variant="outline"
                size="sm"
                // Not `disabled`: it keeps focus while it loads.
                aria-disabled={loading || undefined}
                onClick={() => {
                    if (!loading) {
                        onLoad()
                    }
                }}
                className="aria-disabled:opacity-50"
            >
                {failure !== null || loading ? (
                    <RotateCwIcon
                        aria-hidden="true"
                        className={
                            loading ? 'motion-safe:animate-spin' : undefined
                        }
                    />
                ) : null}
                {loading
                    ? `Loading ${direction} turns…`
                    : failure === null
                      ? `Show ${direction} turns (${formatCount(count)})`
                      : `Try again (${formatCount(count)} ${direction} ${count === 1 ? 'turn' : 'turns'})`}
            </Button>
        </div>
    )
}
