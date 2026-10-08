import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type CountTagProps = {
    children: ReactNode
    className?: string
}

/** A small outlined tag that says how many: the spans of a run, the characters of a prompt. */
export function CountTag({ children, className }: CountTagProps) {
    return (
        <Badge
            data-slot="count-tag"
            variant="outline"
            className={cn(
                'h-auto rounded-sm bg-card px-1.5 py-0.5 text-caption font-normal text-muted-foreground',
                className,
            )}
        >
            {children}
        </Badge>
    )
}
