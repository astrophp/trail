import type { Conversation } from '@/api/types'
import { UserLabel } from '@/components/telemetry/user-label'
import { formatCount } from '@/lib/format'

/**
 * Who the conversation is with: the first user, with their email beneath, and how many more there
 * are, counted from `user_count` (the list holds only a few). A conversation none of whose turns
 * has a user shows nothing, as a run without one does.
 */
export function UserCell({ conversation }: { conversation: Conversation }) {
    const [first] = conversation.users
    const more = Math.max(
        conversation.user_count - (first === undefined ? 0 : 1),
        0,
    )

    if (first === undefined && more === 0) {
        return null
    }

    return (
        <div className="flex min-w-0 flex-col gap-1 leading-normal">
            {first === undefined ? null : (
                <>
                    <span className="flex min-w-0 items-baseline gap-1.5">
                        <UserLabel user={first} className="truncate" />
                        {more === 0 ? null : (
                            <span className="shrink-0 text-caption text-muted-foreground">
                                <span aria-hidden="true">
                                    +{formatCount(more)}
                                </span>
                                <span className="sr-only">
                                    and {formatCount(more)} more{' '}
                                    {more === 1 ? 'user' : 'users'}
                                </span>
                            </span>
                        )}
                    </span>
                    {first.email === null || first.name === null ? null : (
                        <span className="truncate text-caption text-muted-foreground">
                            {first.email}
                        </span>
                    )}
                </>
            )}
            {first === undefined ? (
                <span className="text-caption text-muted-foreground">
                    {formatCount(more)} {more === 1 ? 'user' : 'users'}
                </span>
            ) : null}
        </div>
    )
}
