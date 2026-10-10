import type { ReactNode } from 'react'
import { CopyButton } from '@/components/patterns/copy-button'
import { notify } from '@/components/patterns/notify'
import { cn } from '@/lib/utils'

type KeyValueProps = {
    label: string
    /** The value: any node, so callers can pass telemetry components. Without one (or with an empty string) the row says it is missing and has no copy button. */
    children?: ReactNode
    /** Adds a button that copies this text. */
    copy?: string
    /** The words shown when there is no value. Defaults to `Not captured`. */
    missing?: string
    /** A part of the row above it, indented under it in the `rows` layout. */
    nested?: boolean
    className?: string
}

/** One label and its value inside a `KeyValueList`. Long values wrap; they never push the page wider. */
export function KeyValue({
    label,
    children,
    copy,
    missing,
    nested,
    className,
}: KeyValueProps) {
    const absent =
        children === null || children === undefined || children === ''

    return (
        <div
            data-slot="key-value"
            className={cn(
                'flex min-w-0 flex-col gap-0.5',
                // In a `rows` list: label and value side by side, a hairline under every row but the last.
                'group-data-[layout=rows]/kvl:flex-row group-data-[layout=rows]/kvl:items-center group-data-[layout=rows]/kvl:gap-4 group-data-[layout=rows]/kvl:border-b group-data-[layout=rows]/kvl:py-2.5 group-data-[layout=rows]/kvl:last:border-b-0',
                className,
            )}
        >
            <dt
                className={cn(
                    'text-caption text-muted-foreground',
                    'group-data-[layout=rows]/kvl:w-1/3 group-data-[layout=rows]/kvl:min-w-32 group-data-[layout=rows]/kvl:shrink-0 group-data-[layout=rows]/kvl:text-ui',
                    nested && 'group-data-[layout=rows]/kvl:ps-4',
                )}
            >
                {label}
            </dt>
            <dd className="flex min-w-0 items-start gap-1.5 text-ui group-data-[layout=rows]/kvl:min-h-6 group-data-[layout=rows]/kvl:flex-1 group-data-[layout=rows]/kvl:items-center">
                <span className="min-w-0 flex-1 wrap-anywhere group-data-[layout=rows]/kvl:flex-initial">
                    {absent ? (
                        <span className="text-muted-foreground">
                            {missing ?? 'Not captured'}
                        </span>
                    ) : (
                        children
                    )}
                </span>
                {copy === undefined || absent ? null : (
                    <CopyButton
                        text={copy}
                        label={`Copy ${label}`}
                        onCopied={() => notify.success(`Copied ${label}`)}
                        onFailed={() => notify.error(`Could not copy ${label}`)}
                    />
                )}
            </dd>
        </div>
    )
}
