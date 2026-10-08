import type { ComponentProps } from 'react'
import { CardFooter } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/** The line under the content of a `Panel`: a note about the figures above, or a link to more. */
export function PanelFooter({ className, ...props }: ComponentProps<'div'>) {
    return (
        <CardFooter
            data-slot="panel-footer"
            className={cn(
                'bg-transparent px-5 py-3 text-caption text-muted-foreground',
                className,
            )}
            {...props}
        />
    )
}
