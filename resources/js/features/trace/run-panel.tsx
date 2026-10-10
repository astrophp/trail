import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type RunPanelProps = {
    title: string
    children: ReactNode
    className?: string
}

/** A titled card of the run's summary. */
export function RunPanel({ title, children, className }: RunPanelProps) {
    return (
        <section
            data-slot="run-panel"
            aria-label={title}
            className={cn(
                'flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-5',
                className,
            )}
        >
            <h2 className="text-heading">{title}</h2>
            {children}
        </section>
    )
}
