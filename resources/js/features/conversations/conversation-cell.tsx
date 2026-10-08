import type { Conversation } from '@/api/types'
import { RowLink } from '@/components/patterns/row-link'
import { conversationPath } from '@/lib/conversation-path'
import { formatCount } from '@/lib/format'

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

    return (
        <div className="flex max-w-55 min-w-0 flex-col gap-1 leading-normal md:max-w-85">
            <RowLink
                to={conversationPath(conversation.id)}
                title={prompt ?? undefined}
                className="truncate"
            >
                {prompt ?? 'Prompt not captured'}
            </RowLink>
            <p
                title={conversation.id}
                className="truncate font-mono text-caption text-faint"
            >
                {conversation.id}
                {agents === '' ? null : ` · ${agents}`}
            </p>
        </div>
    )
}
