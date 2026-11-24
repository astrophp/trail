import { UserIcon } from 'lucide-react'
import type { Message, User } from '@/api/types'
import { Panel } from '@/components/patterns/panel'
import { MessageItem } from '@/components/telemetry/message-item'
import { UserLabel } from '@/components/telemetry/user-label'

type TurnPromptProps = {
    prompt: Message
    /** Who the turn ran for; the message stands without a name when there is none. */
    user: User | null
    /** Names the viewers of the message (`turn 3 prompt text`). */
    label: string
}

/** Up to two letters of a name, for its avatar; `null` when the name has none. */
function initialsOf(name: string | null): string | null {
    const letters = (name ?? '')
        .split(/\s+/)
        .filter((word) => word !== '')
        .slice(0, 2)
        .map((word) => Array.from(word)[0].toUpperCase())
        .join('')

    return letters === '' ? null : letters
}

/**
 * What the user asked, in a lightly tinted container of its own: a header with a round avatar of
 * their initials and their name, a line, and the message as it was sent at full width. It reads
 * apart from the agent's white card below it.
 */
export function TurnPrompt({ prompt, user, label }: TurnPromptProps) {
    const initials = user === null ? null : initialsOf(user.name)

    return (
        <Panel data-slot="turn-prompt" className="min-w-0 bg-muted/50">
            <div className="flex min-w-0 items-center gap-2.5 border-b px-5 py-4">
                <span
                    aria-hidden="true"
                    className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-background text-caption font-medium text-muted-foreground"
                >
                    {initials ?? <UserIcon className="size-3.5" />}
                </span>
                {user === null ? (
                    <span className="text-xs text-muted-foreground">
                        Prompt
                    </span>
                ) : (
                    <UserLabel user={user} className="text-xs font-medium" />
                )}
            </div>
            <MessageItem
                variant="plain"
                message={prompt}
                truncatedPaths={prompt.truncated_paths}
                heading={label}
                className="p-5"
            />
        </Panel>
    )
}
