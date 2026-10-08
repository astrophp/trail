import type { Turn } from '@/api/types'
import { Notice } from '@/components/patterns/notice'
import {
    notStoredTitle,
    partialReasonWords,
    partialTitle,
} from '@/features/conversations/messages-words'

/** What a turn says when its messages are not all there; nothing when they are. */
export function TurnMessagesNotice({ turn }: { turn: Turn }) {
    if (turn.messages_state === 'stored') {
        return null
    }

    if (turn.messages_state === 'not_stored') {
        return <Notice tone="info" title={notStoredTitle} />
    }

    return (
        <Notice tone="warning" title={partialTitle}>
            {turn.messages_reason === null
                ? null
                : partialReasonWords[turn.messages_reason]}
        </Notice>
    )
}
