import type { ReactNode } from 'react'
import {
    CardAction,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

type PanelHeaderProps = {
    title: string
    /** The level of the title: 2 (the default) under a page's title, 3 inside another section. */
    headingLevel?: 2 | 3 | 4
    description?: ReactNode
    /** A control that acts on the panel, at the end of the header: a tab list, a link. */
    action?: ReactNode
    /** Sits right after the title: an `InfoHint` with a detail the panel need not spell out. */
    hint?: ReactNode
    /**
     * Makes the heading something a link can point at and move focus to: an `id`, and `tabIndex`
     * -1 so script can focus it without it becoming a tab stop.
     */
    titleTarget?: { id: string }
    className?: string
}

/** The title of a `Panel`, with an optional description and an action. */
export function PanelHeader({
    title,
    headingLevel = 2,
    description,
    action,
    hint,
    titleTarget,
    className,
}: PanelHeaderProps) {
    return (
        <CardHeader
            data-slot="panel-header"
            className={cn('px-5 pt-5 pb-3.5', className)}
        >
            {/* The hint sits beside the heading, not in it, so the heading's name stays the title. */}
            <div className="flex min-w-0 items-center gap-1.5">
                <CardTitle
                    role="heading"
                    aria-level={headingLevel}
                    id={titleTarget?.id}
                    tabIndex={titleTarget ? -1 : undefined}
                    className="text-heading"
                >
                    {title}
                </CardTitle>
                {hint}
            </div>
            {description ? (
                <CardDescription className="text-xs">
                    {description}
                </CardDescription>
            ) : null}
            {action ? (
                <CardAction className="self-center">{action}</CardAction>
            ) : null}
        </CardHeader>
    )
}
