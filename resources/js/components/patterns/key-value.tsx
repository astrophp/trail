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
    className?: string
}

/** One label and its value inside a `KeyValueList`. Long values wrap; they never push the page wider. */
export function KeyValue({
    label,
    children,
    copy,
    missing,
    className,
}: KeyValueProps) {
    const absent =
        children === null || children === undefined || children === ''

    return (
        <div
            data-slot="key-value"
            className={cn('flex min-w-0 flex-col gap-0.5', className)}
        >
            <dt className="text-caption text-muted-foreground">{label}</dt>
            <dd className="flex min-w-0 items-start gap-1.5 text-ui">
                <span className="min-w-0 flex-1 wrap-anywhere">
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
