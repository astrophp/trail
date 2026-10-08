import type { Span } from '@/api/types'
import { PayloadViewer } from '@/components/patterns/payload-viewer'
import { truncationAt } from '@/components/telemetry/payload-truncation'
import type { JsonValue } from '@/lib/json'

type StoredPayloadProps = {
    span: Pick<Span, 'truncated_paths'>
    /** Where the value sits in the span (`input.prompt`), which says whether it was cut short. */
    path: string
    /** Names the viewer and its copy button. */
    label: string
    /** The label row of the viewer, when the value has no label of its own above it. */
    heading?: string
    value: JsonValue | undefined
    className?: string
}

/** A stored value in the payload viewer, with the span's own marks for what was cut short. */
export function StoredPayload({
    span,
    path,
    label,
    heading,
    value,
    className,
}: StoredPayloadProps) {
    const { truncated, originalLength } = truncationAt(
        span.truncated_paths,
        path,
    )

    return (
        <PayloadViewer
            value={value}
            label={label}
            heading={heading}
            truncated={truncated}
            originalLength={originalLength}
            className={className}
        />
    )
}
