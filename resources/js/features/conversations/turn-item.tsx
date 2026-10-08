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

type TurnItemProps = {
    turn: Turn
    /** Its place in the whole conversation, counted from 1. */
    number: number
    /** The tool calls are shown as chips. */
    tools: boolean
}

/**
 * One turn of the transcript: when it started and how it ended, what the user asked, what the
 * agent did, what it answered, and a line of its figures with the way to its trace. What the turn
 * did not store is said in the turn, never filled in.
 */
export function TurnItem({ turn, number, tools }: TurnItemProps) {
    const prompt = promptOf(turn)
    const label = `Turn ${formatCount(number)}`

    return (
        <article
            id={turnDomId(turn.trace.id)}
            aria-labelledby={turnHeadingDomId(turn.trace.id)}
            data-slot="turn-item"
            className="flex scroll-mt-20 flex-col gap-5 border-b py-8 first:pt-0 last:border-b-0"
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
            <TurnActivity turn={turn} number={number} tools={tools} />
            <TurnResponse turn={turn} number={number} />
            <TurnMeta trace={turn.trace} number={number} />
        </article>
    )
}
