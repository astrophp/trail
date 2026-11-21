import type { ReactNode } from 'react'
import type { Span } from '@/api/types'
import { StoredPayload } from '@/components/telemetry/stored-payload'
import type { JsonValue } from '@/lib/json'

type NamedPayloadProps = {
    span: Pick<Span, 'truncated_paths'>
    /** Where the value sits in the span, which says whether it was cut short. */
    path: string
    /** The tool the arguments or the result belong to. */
    name: string
    /** Names the viewer and its controls; unique among the viewers of the tab (`message 3 search arguments`). */
    label: string
    value: JsonValue | undefined
    /** `json` shows a result stored as JSON text as a tree; see `PayloadViewer`. */
    format?: 'text' | 'json'
    /** Sits beside the name: a link to another span, or what became of the call. */
    children?: ReactNode
}

/**
 * The arguments a tool was called with, or the result it returned, as one framed block: the
 * tool's name (and what sits beside it) in the header bar with the view switch and copy, the
 * value under it.
 */
export function NamedPayload({
    span,
    path,
    name,
    label,
    value,
    format,
    children,
}: NamedPayloadProps) {
    return (
        <div data-slot="named-payload" className="min-w-0">
            <StoredPayload
                span={span}
                path={path}
                label={label}
                value={value}
                format={format}
                title={
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-mono text-xs break-all">
                            {name}
                        </span>
                        {children}
                    </div>
                }
            />
        </div>
    )
}
