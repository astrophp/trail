import {
    BotIcon,
    BoxIcon,
    TagsIcon,
    ListOrderedIcon,
    type LucideIcon,
} from 'lucide-react'
import type { Trace } from '@/api/types'
import { cn } from '@/lib/utils'

const icons: Record<Trace['type'], { label: string; Icon: LucideIcon }> = {
    agent: { label: 'Agent run', Icon: BotIcon },
    embedding: { label: 'Embedding run', Icon: BoxIcon },
    classification: { label: 'Classification run', Icon: TagsIcon },
    reranking: { label: 'Reranking run', Icon: ListOrderedIcon },
}

/** The label of a root operation, also used outside its icon. */
export const operationTypeLabel = (type: Trace['type']): string =>
    icons[type].label

type AgentIconProps = {
    type: Trace['type']
    className?: string
}

/** The icon of a run: an agent, or an embedding. */
export function AgentIcon({ type, className }: AgentIconProps) {
    const { label, Icon } = icons[type]

    return (
        <Icon
            data-slot="agent-icon"
            role="img"
            aria-label={label}
            className={cn(
                'size-3.75 shrink-0 text-muted-foreground',
                className,
            )}
        />
    )
}
