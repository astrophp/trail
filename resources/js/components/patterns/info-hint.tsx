import { InfoIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type InfoHintProps = {
    /** Names the button: what the hint is about (`About model prices`). */
    label: string
    /** The detail, shown on hover or focus. A sentence or two, never a manual. */
    children: ReactNode
    className?: string
}

/**
 * A small ⓘ beside a title or a value, holding a detail the screen does not need to say out loud:
 * a caveat that keeps a figure honest, or how something is counted. The page explains itself; the
 * hint is there for whoever asks. It opens on hover and on keyboard focus.
 */
export function InfoHint({ label, children, className }: InfoHintProps) {
    return (
        // Its own provider, so a hint works wherever it is drawn.
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        data-slot="info-hint"
                        aria-label={label}
                        className={cn(
                            'inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                            className,
                        )}
                    >
                        <InfoIcon aria-hidden="true" className="size-3.5" />
                    </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-pretty">
                    {children}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
