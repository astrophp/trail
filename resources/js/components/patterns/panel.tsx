import type { ComponentProps } from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * A titled, bordered section for a block of a page. Compose it from `PanelHeader`,
 * `PanelContent` and `PanelFooter`; the states go inside the content.
 */
export function Panel({ className, ...props }: ComponentProps<'div'>) {
    return (
        <Card
            data-slot="panel"
            className={cn(
                'gap-0 rounded-lg border bg-card py-0 ring-0',
                className,
            )}
            {...props}
        />
    )
}
