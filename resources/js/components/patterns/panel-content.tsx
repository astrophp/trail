import type { ComponentProps } from 'react'
import { CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/** The body of a `Panel`. A state (`PanelLoading`, `PanelEmpty`, `PanelError`) goes inside it. */
export function PanelContent({ className, ...props }: ComponentProps<'div'>) {
    return (
        <CardContent
            data-slot="panel-content"
            className={cn('px-5 pb-5 first:pt-5', className)}
            {...props}
        />
    )
}
