import type { Span } from '@/api/types'
import { StoredPayload } from '@/features/trace/stored-payload'
import type { JsonValue } from '@/lib/json'
import { cn } from '@/lib/utils'

type PayloadSectionProps = {
    span: Pick<Span, 'truncated_paths'>
    /** Where the value sits in the span (`input.prompt`). */
    path: string
    heading: string
    /** Names the viewer and its copy button; defaults to the heading in lower case. */
    label?: string
    value: JsonValue | undefined
    className?: string
}

/** A stored value under its heading, with the copy button and the view switch in the heading's row. */
export function PayloadSection({
    span,
    path,
    heading,
    label = heading.toLowerCase(),
    value,
    className,
}: PayloadSectionProps) {
    return (
        <section
            data-slot="payload-section"
            className={cn('min-w-0', className)}
        >
            <StoredPayload
                span={span}
                path={path}
                label={label}
                heading={heading}
                value={value}
            />
        </section>
    )
}
