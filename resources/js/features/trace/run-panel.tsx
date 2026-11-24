import type { ReactNode } from 'react'
import { Panel } from '@/components/patterns/panel'
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
            className={cn('min-w-0', className)}
        >
            <Panel className="flex min-w-0 flex-col gap-3 p-5">
                <h2 className="text-heading">{title}</h2>
                {children}
            </Panel>
        </section>
    )
}
