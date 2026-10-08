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
    /** Sits beside the name: a link to another span, or what became of the call. */
    children?: ReactNode
}

/** The arguments a tool was called with, or the result it returned, under the tool's name. */
export function NamedPayload({
    span,
    path,
    name,
    label,
    value,
    children,
}: NamedPayloadProps) {
    return (
        <div data-slot="named-payload" className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs break-all">{name}</span>
                {children}
            </div>
            <StoredPayload
                span={span}
                path={path}
                label={label}
                value={value}
            />
        </div>
    )
}
