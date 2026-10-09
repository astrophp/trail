import {
    CircleAlertIcon,
    CircleHelpIcon,
    ClockAlertIcon,
    HourglassIcon,
    RotateCcwIcon,
    WorkflowIcon,
    type LucideIcon,
} from 'lucide-react'
import type { AttentionKind } from '@/api/types'
import { formatCount } from '@/lib/format'

type Wording = {
    title: string
    /** Says exactly what the count is, and nothing more. */
    describe: (count: number) => string
    Icon: LucideIcon
    /** The tone of the icon; the words carry the meaning. */
    tone: string
}

const wordings: Record<AttentionKind, Wording> = {
    failed: {
        title: 'Failed runs',
        describe: (count) => `${formatCount(count)} failed`,
        Icon: CircleAlertIcon,
        tone: 'text-destructive',
    },
    incomplete: {
        title: 'Incomplete runs',
        describe: (count) => `${formatCount(count)} stopped without finishing`,
        Icon: ClockAlertIcon,
        tone: 'text-warning',
    },
    awaiting_approval: {
        title: 'Awaiting approval',
        describe: (count) => `${formatCount(count)} waiting for a decision`,
        Icon: HourglassIcon,
        tone: 'text-warning',
    },
    child_failed: {
        title: 'Sub-agent failed',
        describe: (count) =>
            `${formatCount(count)} completed with a failed sub-agent`,
        Icon: WorkflowIcon,
        tone: 'text-destructive',
    },
    unpriced: {
        title: 'Unpriced usage',
        describe: (count) =>
            `${formatCount(count)} with steps that could not be priced`,
        Icon: CircleHelpIcon,
        tone: 'text-muted-foreground',
    },
    recovered: {
        title: 'Recovered by failover',
        describe: (count) =>
            `${formatCount(count)} recovered after a provider failed`,
        Icon: RotateCcwIcon,
        tone: 'text-muted-foreground',
    },
}

/** Whether this client has words for a kind: the API may one day send one it does not. */
export const isAttentionKind = (kind: string): kind is AttentionKind =>
    Object.hasOwn(wordings, kind)

/** The words and the icon of one kind of item. */
export const attentionWording = (kind: AttentionKind): Wording => wordings[kind]
