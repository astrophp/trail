import { CheckIcon, CopyIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** How long the button shows that the copy worked. */
const confirmMs = 1500

type CopyButtonProps = {
    /** What goes on the clipboard. */
    text: string
    /** The button's accessible name: what is copied ("Copy run id"). It does not change after a copy. */
    label: string
    /** Called after the text reached the clipboard. */
    onCopied?: () => void
    /** Called when it did not: no clipboard in this context, or the browser refused. */
    onFailed?: () => void
    className?: string
}

/**
 * A small icon button that copies a text. The outcome is the caller's to report (usually with
 * `notify`); the button itself only shows a check for a moment after a copy that worked.
 */
export function CopyButton({
    text,
    label,
    onCopied,
    onFailed,
    className,
}: CopyButtonProps) {
    const [copied, setCopied] = useState(false)
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    useEffect(() => () => clearTimeout(timer.current), [])

    async function copy() {
        try {
            // `navigator.clipboard` is missing outside a secure context.
            await navigator.clipboard.writeText(text)
        } catch {
            setCopied(false)
            onFailed?.()

            return
        }

        setCopied(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), confirmMs)
        onCopied?.()
    }

    const Icon = copied ? CheckIcon : CopyIcon

    return (
        <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={label}
            data-slot="copy-button"
            data-copied={copied || undefined}
            onClick={() => void copy()}
            className={cn('text-muted-foreground', className)}
        >
            <Icon aria-hidden="true" />
        </Button>
    )
}
