import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type SectionLabelProps = {
    children: ReactNode
    /** `h3` for a label that names a section; `p` for one inside a section that already has a heading. */
    as?: 'h3' | 'p'
    className?: string
}

/** The quiet label over a piece of evidence: small, muted and medium in weight. */
export function SectionLabel({
    children,
    as: Tag = 'h3',
    className,
}: SectionLabelProps) {
    return (
        <Tag
            data-slot="section-label"
            className={cn(
                'text-xs font-medium text-muted-foreground',
                className,
            )}
        >
            {children}
        </Tag>
    )
}
