import { RotateCwIcon } from 'lucide-react'
import { Notice } from '@/components/patterns/notice'
import { Button } from '@/components/ui/button'
import { formatCount } from '@/lib/format'

type EarlierTurnsProps = {
    /** How many turns came before the first one shown: the database's count, not the length of any list. */
    older: number
    loading: boolean
    /** A load failed; the turns already shown stay. `null` when none did. */
    failure: { error: unknown } | null
    onLoad: () => void
}

function reason(error: unknown): string | undefined {
    return error instanceof Error && error.message !== ''
        ? error.message
        : undefined
}

/**
 * The way to the turns before the first one shown. It is offered only while there are some, and
 * says how many. A failed load is said above the button, which stays where it is (and keeps focus)
 * and becomes the retry.
 */
export function EarlierTurns({
    older,
    loading,
    failure,
    onLoad,
}: EarlierTurnsProps) {
    if (older <= 0) {
        return null
    }

    return (
        <div
            data-slot="earlier-turns"
            className="flex flex-col items-start gap-3 pb-6"
        >
            {failure === null ? null : (
                <Notice
                    tone="danger"
                    title="Earlier turns could not be loaded"
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
                    ? 'Loading earlier turns…'
                    : failure === null
                      ? `Show earlier turns (${formatCount(older)})`
                      : `Try again (${formatCount(older)} earlier ${older === 1 ? 'turn' : 'turns'})`}
            </Button>
        </div>
    )
}
