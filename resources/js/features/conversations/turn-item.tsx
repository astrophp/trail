import type { Turn } from '@/api/types'
import { TurnActivity } from '@/features/conversations/turn-activity'
import { TurnHeader } from '@/features/conversations/turn-header'
import { TurnMessagesNotice } from '@/features/conversations/turn-messages-notice'
import { TurnMeta } from '@/features/conversations/turn-meta'
import { TurnPrompt } from '@/features/conversations/turn-prompt'
import { TurnResponse } from '@/features/conversations/turn-response'
import {
    promptOf,
    turnDomId,
    turnHeadingDomId,
} from '@/features/conversations/transcript-turns'
import { formatCount } from '@/lib/format'
import { cn } from '@/lib/utils'

type TurnItemProps = {
    turn: Turn
    /** Its place in the whole conversation, counted from 1. */
    number: number
    /** The tool calls are shown as chips. */
    tools: boolean
    /** The conversation's page at this turn (`turn` in its address): the way back from the run's page, and the turn's own link. */
    pagePath: string
    /** The reader was just taken here: the turn is quietly highlighted for a moment. */
    marked: boolean
    /** A link from the turn is followed: the page records this turn as the place to come back to. */
    onVisit: () => void
}

/**
 * One turn of the transcript: when it started and how it ended, what the user asked, what the
 * agent did, what it answered, and a line of its figures with the way to its trace. What the turn
 * did not store is said in the turn, never filled in.
 */
export function TurnItem({
    turn,
    number,
    tools,
    pagePath,
    marked,
    onVisit,
}: TurnItemProps) {
    const prompt = promptOf(turn)
    const label = `Turn ${formatCount(number)}`

    return (
        <article
            id={turnDomId(turn.trace.id)}
            aria-labelledby={turnHeadingDomId(turn.trace.id)}
            data-slot="turn-item"
            data-marked={marked || undefined}
            className={cn(
                'flex scroll-mt-20 flex-col gap-5 border-b py-8 first:pt-0 last:border-b-0 motion-safe:transition-colors motion-safe:duration-700',
                // A ring in the same colour widens the highlight without moving anything.
                marked && 'rounded-sm bg-accent ring-8 ring-accent',
            )}
        >
            <TurnHeader turn={turn} number={number} />
            <TurnMessagesNotice turn={turn} />
            {prompt === undefined ? null : (
                <TurnPrompt
                    prompt={prompt}
                    user={turn.trace.user}
                    label={`${label} prompt`}
                />
            )}
            <TurnActivity
                turn={turn}
                number={number}
                tools={tools}
                pagePath={pagePath}
                onVisit={onVisit}
            />
            <TurnResponse turn={turn} number={number} />
            <TurnMeta
                trace={turn.trace}
                number={number}
                pagePath={pagePath}
                onVisit={onVisit}
            />
        </article>
    )
}
