import { SectionLabel } from '@/components/telemetry/section-label'
import { StatusBadge } from '@/components/telemetry/status-badge'
import {
    promptOf,
    promptStart,
    turnDomId,
    type NumberedTurn,
} from '@/features/conversations/transcript-turns'
import { formatCount } from '@/lib/format'

type JumpToTurnProps = {
    /** The turns that are loaded: the list never promises a turn that is not on the page. */
    turns: NumberedTurn[]
    onJump: (traceId: string) => void
}

/** A list of the loaded turns (number, the start of the prompt, how it ended), each a link to that turn. */
export function JumpToTurn({ turns, onJump }: JumpToTurnProps) {
    if (turns.length === 0) {
        return null
    }

    return (
        <nav aria-label="Jump to turn" className="flex min-w-0 flex-col gap-2">
            <SectionLabel>Jump to turn</SectionLabel>
            <ol className="flex flex-col">
                {turns.map(({ turn, number }) => {
                    const start = promptStart(turn)

                    return (
                        <li key={turn.trace.id} className="min-w-0">
                            <a
                                href={`#${turnDomId(turn.trace.id)}`}
                                onClick={(event) => {
                                    event.preventDefault()
                                    onJump(turn.trace.id)
                                }}
                                className="flex min-w-0 items-center gap-2 rounded-sm py-1.5 text-ui hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            >
                                <span className="shrink-0 font-mono text-caption text-muted-foreground tabular-nums">
                                    #{formatCount(number)}
                                </span>
                                <span
                                    className={
                                        start === null
                                            ? 'min-w-0 flex-1 truncate text-muted-foreground'
                                            : 'min-w-0 flex-1 truncate'
                                    }
                                    title={start ?? undefined}
                                >
                                    {start ??
                                        (promptOf(turn) === undefined
                                            ? 'No prompt stored'
                                            : 'Prompt is not text')}
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
        </nav>
    )
}
