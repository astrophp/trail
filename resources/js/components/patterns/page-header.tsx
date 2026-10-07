import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type PageHeaderProps = {
    title: string
    description?: ReactNode
    /** Controls that belong to the page as a whole, shown at the end of the row. */
    children?: ReactNode
    className?: string
}

/** The heading of a page: its title, an optional description, and optional actions. */
export function PageHeader({
    title,
    description,
    children,
    className,
}: PageHeaderProps) {
    return (
        <div
            data-slot="page-header"
            className={cn(
                'flex flex-wrap items-start justify-between gap-4',
                className,
            )}
        >
            <div className="flex min-w-0 flex-col gap-1.75">
                {/* Focusable by script only: the app moves focus here after a page change. */}
                <h1
                    tabIndex={-1}
                    className="rounded-sm text-title-compact outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:text-title"
                >
                    {title}
                </h1>
                {description ? (
                    <p className="text-ui text-muted-foreground">
                        {description}
                    </p>
                ) : null}
            </div>
            {children ? (
                <div className="flex items-center gap-2">{children}</div>
            ) : null}
        </div>
    )
}
