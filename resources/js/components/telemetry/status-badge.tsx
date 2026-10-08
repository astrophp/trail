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

/** The words for a status, for anything that names one outside a badge: a tab, a filter chip. */
export function statusLabel(status: Status): string {
    return statuses[status].label
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
            /** A soft pill in the status colour, for where the status is the page's own. */
            tinted: {
                true: 'rounded-full px-2 py-0.5 font-medium',
                false: '',
            },
        },
        compoundVariants: [
            { status: 'completed', tinted: true, class: 'bg-success-soft' },
            { status: 'failed', tinted: true, class: 'bg-destructive-soft' },
            { status: 'running', tinted: true, class: 'bg-info-soft' },
            { status: 'incomplete', tinted: true, class: 'bg-warning-soft' },
            {
                status: 'awaiting_approval',
                tinted: true,
                class: 'bg-primary-soft',
            },
        ],
        defaultVariants: { tinted: false },
    },
)

type StatusBadgeProps = {
    status: Status
    /** Sits on a soft tint of the status colour, as a pill. */
    tinted?: boolean
    className?: string
}

/** The outcome of a run: an icon and a word, coloured. */
export function StatusBadge({
    status,
    tinted = false,
    className,
}: StatusBadgeProps) {
    const { label, Icon } = statuses[status]

    return (
        <span
            data-slot="status-badge"
            data-status={status}
            className={cn(badge({ status, tinted }), className)}
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
