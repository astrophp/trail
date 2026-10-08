import { LinkIcon } from 'lucide-react'
import type { ComponentProps } from 'react'
import { useHref } from 'react-router'
import { notify } from '@/components/patterns/notify'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type CopyLinkButtonProps = {
    /** The page to copy the address of: a path and query relative to the dashboard's base path. */
    to: string
    /** The button's accessible name when "Copy link" alone does not say which link ("Copy link to turn 3"). */
    label?: string
    /** Where the words go away (a narrow screen) the name stays. */
    hideWordsWhenNarrow?: boolean
    size?: ComponentProps<typeof Button>['size']
    variant?: ComponentProps<typeof Button>['variant']
    className?: string
}

/**
 * Copies the address of a page of the dashboard, with the dashboard's base path and the
 * application's origin put in front of `to`, and says whether it worked.
 */
export function CopyLinkButton({
    to,
    label,
    hideWordsWhenNarrow = false,
    size = 'sm',
    variant = 'outline',
    className,
}: CopyLinkButtonProps) {
    const href = useHref(to)

    async function copy() {
        try {
            // `navigator.clipboard` is missing outside a secure context.
            await navigator.clipboard.writeText(
                new URL(href, window.location.origin).href,
            )
        } catch {
            notify.error('The link could not be copied.')

            return
        }

        notify.success('Link copied.')
    }

    return (
        <Button
            type="button"
            variant={variant}
            size={size}
            aria-label={label}
            data-slot="copy-link-button"
            onClick={() => void copy()}
            className={cn(className)}
        >
            <LinkIcon aria-hidden="true" />
            <span className={cn(hideWordsWhenNarrow && 'max-md:sr-only')}>
                Copy link
            </span>
        </Button>
    )
}
