import { DownloadIcon } from 'lucide-react'
import type { ComponentProps } from 'react'
import { Button } from '@/components/ui/button'

type ExportLinkButtonProps = {
    /** Where the file is: a link the browser follows and streams itself. */
    href: string
    /** What the button says. Defaults to "Export". */
    children?: string
    /** The accessible name, when the words alone do not say what is exported. */
    label?: string
    /** Said on hover: the limits of the file, for example. */
    title?: string
    size?: ComponentProps<typeof Button>['size']
    className?: string
}

/**
 * A plain download link that looks like a button: the browser follows `href` and writes the file
 * itself, so nothing is fetched or built here. The caller builds the address from the view on
 * screen and the server decides what the file holds.
 */
export function ExportLinkButton({
    href,
    children = 'Export',
    label,
    title,
    size,
    className,
}: ExportLinkButtonProps) {
    return (
        <Button asChild variant="outline" size={size} className={className}>
            <a href={href} download title={title} aria-label={label}>
                <DownloadIcon aria-hidden="true" />
                {children}
            </a>
        </Button>
    )
}
