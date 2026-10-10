import type { ReactNode } from 'react'
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyTitle,
} from '@/components/ui/empty'
import { cn } from '@/lib/utils'

type PanelEmptyProps = {
    title: string
    description?: ReactNode
    className?: string
}

/** A `Panel` with nothing to show. Smaller than a page's `EmptyState`, and not a heading. */
export function PanelEmpty({ title, description, className }: PanelEmptyProps) {
    return (
        <Empty data-slot="panel-empty" className={cn('px-4 py-8', className)}>
            <EmptyHeader className="gap-1">
                <EmptyTitle className="text-ui">{title}</EmptyTitle>
                {description ? (
                    <EmptyDescription className="text-ui">
                        {description}
                    </EmptyDescription>
                ) : null}
            </EmptyHeader>
        </Empty>
    )
}
