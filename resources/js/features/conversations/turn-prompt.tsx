import { UserIcon } from 'lucide-react'
import type { Message, User } from '@/api/types'
import { MessageItem } from '@/components/telemetry/message-item'
import { UserLabel } from '@/components/telemetry/user-label'
import { cn } from '@/lib/utils'

type TurnPromptProps = {
    prompt: Message
    /** Who the turn ran for; the bubble stands alone without one. */
    user: User | null
    /** Names the viewers of the message (`turn 3 prompt text`). */
    label: string
}

/** What the user asked: their name and the message in a soft bubble. */
export function TurnPrompt({ prompt, user, label }: TurnPromptProps) {
    return (
        <div data-slot="turn-prompt" className="flex gap-3">
            <span
                aria-hidden="true"
                className={cn(
                    'size-7 shrink-0',
                    user !== null &&
                        'flex items-center justify-center rounded-full border bg-muted text-muted-foreground',
                )}
            >
                {user === null ? null : <UserIcon className="size-3.5" />}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {user === null ? null : (
                    <UserLabel user={user} className="text-xs font-medium" />
                )}
                <MessageItem
                    variant="bubble"
                    message={prompt}
                    truncatedPaths={prompt.truncated_paths}
                    heading={label}
                />
            </div>
        </div>
    )
}
