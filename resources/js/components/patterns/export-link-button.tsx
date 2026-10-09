import { DownloadIcon } from 'lucide-react'
import type { ComponentProps } from 'react'
import { Button } from '@/components/ui/button'

type ExportLinkButtonProps = {
    /** Where the file is: a link the browser follows and streams itself. */
    href: string
    /** What the button says. Defaults to "Export". */
    children?: string
    /**
     * What is exported, when the words alone do not say. The accessible name is the words, then
     * this: "Export CSV: the breakdown by model", so it always contains what is seen.
     */
    detail?: string
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
    detail,
    title,
    size,
    className,
}: ExportLinkButtonProps) {
    return (
        <Button asChild variant="outline" size={size} className={className}>
            <a
                href={href}
                download
                title={title}
                aria-label={
                    detail === undefined ? undefined : `${children}: ${detail}`
                }
            >
                <DownloadIcon aria-hidden="true" />
                {children}
            </a>
        </Button>
    )
}
