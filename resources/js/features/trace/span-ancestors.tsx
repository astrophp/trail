import { Fragment } from 'react'
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import type { SpanTree } from '@/features/trace/build-span-tree'
import { spanTitle } from '@/features/trace/span-title'
import { cn } from '@/lib/utils'

type SpanAncestorsProps = {
    tree: SpanTree
    /** The span whose ancestors are shown. */
    spanId: string
    onSelect: (id: string) => void
    className?: string
}

/** The spans above this one, the run's own first; each selects itself. A top-level span has none. */
export function SpanAncestors({
    tree,
    spanId,
    onSelect,
    className,
}: SpanAncestorsProps) {
    const above = tree.ancestors(spanId)

    if (above.length === 0) {
        return null
    }

    return (
        <Breadcrumb
            // The app's own breadcrumb is called "breadcrumb".
            aria-label="Span ancestors"
            data-slot="span-ancestors"
            className={cn(className)}
        >
            <BreadcrumbList className="text-caption">
                {above.map((id, index) => {
                    const span = tree.byId.get(id)?.span

                    return span === undefined ? null : (
                        <Fragment key={id}>
                            {index > 0 ? <BreadcrumbSeparator /> : null}
                            <BreadcrumbItem>
                                <BreadcrumbLink asChild>
                                    <button
                                        type="button"
                                        onClick={() => onSelect(id)}
                                        className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        {spanTitle(span)}
                                    </button>
                                </BreadcrumbLink>
                            </BreadcrumbItem>
                        </Fragment>
                    )
                })}
            </BreadcrumbList>
        </Breadcrumb>
    )
}
