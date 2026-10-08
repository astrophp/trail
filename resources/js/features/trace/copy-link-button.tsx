import { LinkIcon } from 'lucide-react'
import { useHref } from 'react-router'
import { notify } from '@/components/patterns/notify'
import { Button } from '@/components/ui/button'
import type { Shown } from '@/features/trace/shown-selection'
import { traceParams } from '@/features/trace/trace-params'
import { tracePagePath } from '@/lib/trace-page-path'
import { writeState } from '@/lib/url-state'

/**
 * Copies the address of this run as it is on screen: the span, the tab and the view, and nothing
 * of the list it was opened from. Where the words go away (a narrow screen) the name stays.
 */
export function CopyLinkButton({
    traceId,
    shown,
}: {
    traceId: string
    shown: Shown
}) {
    const query = writeState(traceParams, new URLSearchParams(), shown)
    const href = useHref({
        pathname: tracePagePath(traceId),
        search: query.toString(),
    })

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
            variant="outline"
            size="sm"
            onClick={() => void copy()}
        >
            <LinkIcon aria-hidden="true" />
            <span className="max-md:sr-only">Copy link</span>
        </Button>
    )
}
