import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

const codeVariants = cva('font-mono', {
    variants: {
        variant: {
            /** A name inside a sentence. */
            inline: 'rounded-sm bg-muted px-1 py-0.5 text-caption break-words',
            /** A command or snippet on a line of its own; wraps rather than scrolling or cutting off. */
            block: 'block rounded-lg border bg-muted px-3 py-2.5 text-caption leading-relaxed break-words whitespace-pre-wrap',
        },
    },
    defaultVariants: { variant: 'inline' },
})

type CodeProps = ComponentProps<'code'> & VariantProps<typeof codeVariants>

/**
 * Code in the mono family: a name inside a sentence, or a command on its own line. The text is
 * selectable and never truncated; a long line wraps inside its own box.
 */
export function Code({ variant, className, ...props }: CodeProps) {
    return (
        <code
            data-slot="code"
            data-variant={variant ?? 'inline'}
            className={cn(codeVariants({ variant }), className)}
            {...props}
        />
    )
}
