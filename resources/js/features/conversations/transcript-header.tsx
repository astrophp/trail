import type { Conversation } from '@/api/types'
import { CopyButton } from '@/components/patterns/copy-button'
import { notify } from '@/components/patterns/notify'
import { PageHeader } from '@/components/patterns/page-header'
import { Timestamp } from '@/components/telemetry/timestamp'
import { UserLabel } from '@/components/telemetry/user-label'
import { conversationIdText } from '@/features/conversations/conversation-id'
import { MoreCount } from '@/features/conversations/more-count'

type TranscriptHeaderProps = {
    /** The conversation's id: the one the response returned, else the address's. */
    id: string
    /** Until it is loaded the header has the id alone. */
    conversation?: Conversation
}

/**
 * "Conversation", and under it one muted line: the id (shortened when long, whole in the tooltip
 * and on the clipboard), who it is with, and when it began.
 */
export function TranscriptHeader({ id, conversation }: TranscriptHeaderProps) {
    const [first] = conversation?.users ?? []
    const more = Math.max(
        (conversation?.user_count ?? 0) - (first === undefined ? 0 : 1),
        0,
    )

    return (
        <PageHeader
            title="Conversation"
            description={
                id === '' ? undefined : (
                    <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span className="flex min-w-0 items-center gap-1">
                            <span
                                title={id}
                                className="font-mono text-xs wrap-anywhere"
                            >
                                {conversationIdText(id)}
                            </span>
                            <CopyButton
                                text={id}
                                label="Copy conversation id"
                                onCopied={() =>
                                    notify.success('Conversation id copied.')
                                }
                                onFailed={() =>
                                    notify.error(
                                        'The conversation id could not be copied.',
                                    )
                                }
                            />
                        </span>
                        {first === undefined ? null : (
                            <span className="flex items-baseline gap-1.5">
                                <span className="sr-only">User</span>
                                <UserLabel user={first} />
                                <MoreCount count={more} noun="user" />
                            </span>
                        )}
                        {conversation === undefined ? null : (
                            <Timestamp
                                at={conversation.first_activity_at}
                                layout="inline"
                            />
                        )}
                    </span>
                )
            }
        />
    )
}
