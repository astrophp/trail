import type { Turn } from '@/api/types'
import { StatusBadge } from '@/components/telemetry/status-badge'
import { Timestamp } from '@/components/telemetry/timestamp'
import {
    promptOf,
    promptStart,
    turnDomId,
    type NumberedTurn,
} from '@/features/conversations/transcript-turns'
import { SideCard } from '@/features/conversations/side-card'
import { formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'

type JumpToTurnProps = {
    /** The turns that are loaded: the list never promises a turn that is not on the page. */
    turns: NumberedTurn[]
    onJump: (traceId: string) => void
    /** The trace id of the turn being read, marked in the list; `null` when none is known. */
    current?: string | null
}

/** What stands where a prompt's start would: why there is none. */
function missingPrompt(turn: Turn): string {
    const prompt = promptOf(turn)

    if (prompt === undefined) {
        return 'No prompt stored'
    }

    return typeof prompt.content === 'string'
        ? 'Empty prompt'
        : 'Prompt is not text'
}

/**
 * The loaded turns as a timeline (number, the start of the prompt, when it started, how it
 * ended), each a link to that turn. The turn being read is marked.
 */
export function JumpToTurn({ turns, onJump, current = null }: JumpToTurnProps) {
    if (turns.length === 0) {
        return null
    }

    return (
        <SideCard as="nav" label="Jump to turn">
            <ol className="flex flex-col">
                {turns.map(({ turn, number }) => {
                    const start = promptStart(turn)

                    const here = turn.trace.id === current

                    return (
                        <li key={turn.trace.id} className="group flex min-w-0">
                            {/* The rail: a line through every turn, with a dot at each. */}
                            <span
                                aria-hidden="true"
                                className="relative flex w-3 shrink-0 justify-center"
                            >
                                <span className="absolute inset-y-0 w-px bg-border group-first:top-3 group-last:bottom-auto group-last:h-3" />
                                <span
                                    className={cn(
                                        'relative mt-2.5 size-2 rounded-full border',
                                        here
                                            ? 'border-primary bg-primary'
                                            : 'bg-background',
                                    )}
                                />
                            </span>
                            <a
                                href={`#${turnDomId(turn.trace.id)}`}
                                aria-current={here ? 'location' : undefined}
                                onClick={(event) => {
                                    event.preventDefault()
                                    onJump(turn.trace.id)
                                }}
                                className={cn(
                                    'ms-1.5 flex min-w-0 flex-1 items-start gap-2 rounded-sm px-1.5 py-1.5 text-ui hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                    here && 'bg-accent',
                                )}
                            >
                                <span className="shrink-0 font-mono text-caption leading-5 text-muted-foreground tabular-nums">
                                    #{formatCount(number)}
                                </span>
                                <span className="flex min-w-0 flex-1 flex-col">
                                    <span
                                        className={cn(
                                            'truncate',
                                            start === null &&
                                                'text-muted-foreground',
                                            here && 'font-medium',
                                        )}
                                    >
                                        {start ?? missingPrompt(turn)}
                                    </span>
                                    <Timestamp
                                        at={turn.trace.started_at}
                                        layout="inline"
                                        className="text-caption text-muted-foreground"
                                    />
                                </span>
                                <StatusBadge
                                    status={turn.trace.status}
                                    iconOnly
                                />
                            </a>
                        </li>
                    )
                })}
            </ol>
        </SideCard>
    )
}
