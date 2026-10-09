import type { ReactNode } from 'react'
import type { Price } from '@/api/types'
import { Timestamp } from '@/components/telemetry/timestamp'

/** What a source adds under its name, in the same quiet voice. */
function Note({ children }: { children: ReactNode }) {
    return (
        <span className="block text-caption text-muted-foreground">
            {children}
        </span>
    )
}

/**
 * Where a model's rates come from: its own saved price (and when it was saved), its entry in the
 * configuration, the entry of a shorter id it extends (and whether that one is itself saved), or
 * nowhere. A model that was seen in usage and has no rate is flagged: its usage shows as Unpriced.
 */
export function PriceSource({ price }: { price: Price }) {
    switch (price.source) {
        case 'saved':
            return (
                <span className="block">
                    Saved
                    {price.saved_at === null ? null : (
                        <Timestamp
                            at={price.saved_at}
                            layout="full"
                            className="block text-caption text-muted-foreground"
                        />
                    )}
                </span>
            )
        case 'config':
            return <span className="block">Config</span>
        case 'prefix':
            return (
                <span className="block">
                    From{' '}
                    <span className="font-mono text-xs wrap-anywhere">
                        {price.via?.model}
                    </span>
                    <Note>
                        {price.via?.saved
                            ? 'its saved price'
                            : 'its config entry'}
                    </Note>
                </span>
            )
        case 'none':
            return (
                <span className="block">
                    No rate
                    {price.observed ? (
                        <span className="block text-caption text-warning">
                            Seen in usage, which shows as Unpriced
                        </span>
                    ) : null}
                </span>
            )
    }
}
