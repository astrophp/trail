import type { User } from '@/api/types'
import { cn } from '@/lib/utils'

type UserLabelProps = {
    user: User
    className?: string
}

/** Who ran something: the user's name, or their id when the name can no longer be resolved. The email, or the id, is on hover. */
export function UserLabel({ user, className }: UserLabelProps) {
    return (
        <span
            data-slot="user-label"
            title={user.email ?? user.id}
            className={cn('break-words', className)}
        >
            {user.name ?? user.id}
        </span>
    )
}
