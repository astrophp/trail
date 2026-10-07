import { BotIcon, BoxIcon, type LucideIcon } from 'lucide-react'
import type { Trace } from '@/api/types'
import { cn } from '@/lib/utils'

const icons: Record<Trace['type'], { label: string; Icon: LucideIcon }> = {
    agent: { label: 'Agent run', Icon: BotIcon },
    embedding: { label: 'Embedding run', Icon: BoxIcon },
}

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
