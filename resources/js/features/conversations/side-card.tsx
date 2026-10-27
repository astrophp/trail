import { ChevronDownIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Panel } from '@/components/patterns/panel'
import { PanelContent } from '@/components/patterns/panel-content'
import { PanelHeader } from '@/components/patterns/panel-header'
import { Button } from '@/components/ui/button'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

type SideCardProps = {
    /** The card's title, its heading and the name of its region. */
    label: string
    /** `nav` for a card of links, `section` for one of facts. */
    as?: 'nav' | 'section'
    children: ReactNode
    className?: string
}

/**
 * One card of the column beside the transcript: a panel whose title has a button that folds the
 * card away, and its rows. Open on every visit; folding one only tidies the column for now.
 */
export function SideCard({
    label,
    as: Tag = 'section',
    children,
    className,
}: SideCardProps) {
    const [open, setOpen] = useState(true)

    return (
        <Tag aria-label={label} data-slot="side-card" className="min-w-0">
            <Collapsible open={open} onOpenChange={setOpen} asChild>
                <Panel className={cn('min-w-0', className)}>
                    <PanelHeader
                        title={label}
                        className={cn(!open && 'pb-5')}
                        action={
                            <CollapsibleTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    aria-label={
                                        open
                                            ? `Collapse ${label}`
                                            : `Expand ${label}`
                                    }
                                    className="text-muted-foreground"
                                >
                                    <ChevronDownIcon
                                        aria-hidden="true"
                                        className={cn(
                                            'motion-safe:transition-transform',
                                            !open && '-rotate-90',
                                        )}
                                    />
                                </Button>
                            </CollapsibleTrigger>
                        }
                    />
                    <CollapsibleContent>
                        <PanelContent className="min-w-0">
                            {children}
                        </PanelContent>
                    </CollapsibleContent>
                </Panel>
            </Collapsible>
        </Tag>
    )
}
