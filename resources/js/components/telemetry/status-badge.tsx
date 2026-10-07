import { cva } from 'class-variance-authority'
import {
    CircleCheckIcon,
    CirclePauseIcon,
    CircleXIcon,
    Clock3Icon,
    LoaderCircleIcon,
    type LucideIcon,
} from 'lucide-react'
import type { Status } from '@/api/types'
import { cn } from '@/lib/utils'

// Each status has its own icon and its own words: the colour only reinforces them.
const statuses: Record<Status, { label: string; Icon: LucideIcon }> = {
    completed: { label: 'Completed', Icon: CircleCheckIcon },
    failed: { label: 'Failed', Icon: CircleXIcon },
    running: { label: 'Running', Icon: LoaderCircleIcon },
    incomplete: { label: 'Incomplete', Icon: Clock3Icon },
    awaiting_approval: { label: 'Awaiting approval', Icon: CirclePauseIcon },
}

const badge = cva(
    'inline-flex items-center gap-1.25 text-caption whitespace-nowrap',
    {
        variants: {
            status: {
                completed: 'text-success',
                failed: 'text-destructive',
                running: 'text-info',
                incomplete: 'text-warning',
                awaiting_approval: 'text-primary-ink',
            },
        },
    },
)

type StatusBadgeProps = {
    status: Status
    className?: string
}

/** The outcome of a run: an icon and a word, coloured. */
export function StatusBadge({ status, className }: StatusBadgeProps) {
    const { label, Icon } = statuses[status]

    return (
        <span
            data-slot="status-badge"
            data-status={status}
            className={cn(badge({ status }), className)}
        >
            <Icon
                className={cn(
                    'size-3.25 shrink-0',
                    status === 'running' && 'motion-safe:animate-spin',
                )}
            />
            {label}
        </span>
    )
}
