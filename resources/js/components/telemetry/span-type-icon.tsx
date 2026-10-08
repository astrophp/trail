import { cva } from 'class-variance-authority'
import {
    BotIcon,
    BoxIcon,
    SparklesIcon,
    WrenchIcon,
    type LucideIcon,
} from 'lucide-react'
import type { SpanType } from '@/api/types'
import { cn } from '@/lib/utils'

// The shape of the icon tells the types apart; the colour only reinforces it.
const types: Record<SpanType, { label: string; Icon: LucideIcon }> = {
    agent: { label: 'Agent', Icon: BotIcon },
    step: { label: 'Model step', Icon: SparklesIcon },
    tool: { label: 'Tool', Icon: WrenchIcon },
    embedding: { label: 'Embedding', Icon: BoxIcon },
}

/** The words for a span type, for anything that names one outside an icon. */
export function spanTypeLabel(type: SpanType): string {
    return types[type].label
}

const icon = cva('size-3.75 shrink-0', {
    variants: {
        type: {
            agent: 'text-primary-ink',
            step: 'text-info',
            tool: 'text-warning',
            embedding: 'text-success',
        },
    },
})

type SpanTypeIconProps = {
    type: SpanType
    /** Hide the icon from assistive technology, because the type's name is written beside it. */
    decorative?: boolean
    className?: string
}

/**
 * The icon of a span: an agent, a model step, a tool or an embedding. It already carries the type's
 * name for assistive technology: a caller that prints `spanTypeLabel` beside it passes `decorative`,
 * which hides the icon from them instead.
 */
export function SpanTypeIcon({
    type,
    decorative,
    className,
}: SpanTypeIconProps) {
    const { label, Icon } = types[type]

    return (
        <Icon
            data-slot="span-type-icon"
            data-type={type}
            {...(decorative
                ? { 'aria-hidden': true }
                : { role: 'img', 'aria-label': label })}
            className={cn(icon({ type }), className)}
        />
    )
}
