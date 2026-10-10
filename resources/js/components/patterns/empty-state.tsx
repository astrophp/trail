import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from '@/components/ui/empty'
import { cn } from '@/lib/utils'

type EmptyStateProps = {
    /** A lucide icon component (not an element). It is decoration: the title carries the meaning. */
    icon: LucideIcon
    title: string
    description?: ReactNode
    /** The ways out: usually one button. */
    children?: ReactNode
    className?: string
}

/**
 * Something that holds nothing: no data yet, no match for the filters, nothing at this address.
 * It has no copy of its own; the caller says what is missing and what to do about it.
 */
export function EmptyState({
    icon: Icon,
    title,
    description,
    children,
    className,
}: EmptyStateProps) {
    return (
        <Empty data-slot="empty-state" className={cn('px-6 py-12', className)}>
            <EmptyHeader className="gap-1.5">
                <EmptyMedia
                    variant="icon"
                    className="mb-1.5 size-10 rounded-lg border bg-muted text-muted-foreground [&_svg:not([class*='size-'])]:size-5"
                >
                    <Icon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle
                    role="heading"
                    aria-level={2}
                    className="text-heading"
                >
                    {title}
                </EmptyTitle>
                {description ? (
                    <EmptyDescription className="text-ui">
                        {description}
                    </EmptyDescription>
                ) : null}
            </EmptyHeader>
            {children ? <EmptyContent>{children}</EmptyContent> : null}
        </Empty>
    )
}
