import type { Conversation } from '@/api/types'
import { RowLink } from '@/components/patterns/row-link'
import { conversationPath } from '@/lib/conversation-path'
import { longestWholeId } from '@/lib/conversation-id'
import { formatCount, shortId } from '@/lib/format'

/**
 * The agents of a conversation, by name. The row carries at most a few; `agent_count` is the real
 * number, so what the list leaves out is counted from it.
 */
export function agentLine(conversation: Conversation): string {
    const unnamed = Math.max(
        conversation.agent_count - conversation.agents.length,
        0,
    )
    const names = conversation.agents.join(', ')

    if (names === '') {
        // Only the count is known: say so rather than start the line with a bare "+N".
        return unnamed === 0
            ? ''
            : `${formatCount(unnamed)} ${unnamed === 1 ? 'agent' : 'agents'}`
    }

    return unnamed === 0 ? names : `${names} +${formatCount(unnamed)}`
}

/** What the latest turn was asked, as the link to the conversation, with its id and agents beneath. */
export function ConversationCell({
    conversation,
}: {
    conversation: Conversation
}) {
    const prompt = conversation.prompt_excerpt
    const agents = agentLine(conversation)
    const id = shortId(conversation.id, longestWholeId)
    const line = agents === '' ? id : `${id} · ${agents}`
    // The whole id stays in the tooltip, where the line is cut to the cell.
    const title =
        agents === '' ? conversation.id : `${conversation.id} · ${agents}`

    return (
        <div className="flex max-w-55 min-w-0 flex-col gap-1 leading-normal md:max-w-85 xl:max-w-120">
            <RowLink
                to={conversationPath(conversation.id)}
                title={prompt ?? undefined}
                className="truncate"
            >
                {prompt ?? 'No prompt stored'}
            </RowLink>
            <p
                title={title}
                className="truncate font-mono text-caption text-faint"
            >
                {line}
            </p>
        </div>
    )
}
