import type { ReactNode } from 'react'

type FactProps = {
    label: string
    /** Explains the value on hover. */
    title?: string
    children: ReactNode
}

/** One label with its value, for a `dl`. A shared key-value pattern will replace it. */
export function Fact({ label, title, children }: FactProps) {
    return (
        <div className="flex min-w-0 flex-col gap-1">
            <dt className="text-caption text-muted-foreground">{label}</dt>
            <dd title={title} className="min-w-0 text-ui">
                {children}
            </dd>
        </div>
    )
}
