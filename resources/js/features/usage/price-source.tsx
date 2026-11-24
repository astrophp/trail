import type { ReactNode } from 'react'
import type { Price } from '@/api/types'
import { InfoHint } from '@/components/patterns/info-hint'
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
 * nowhere. Missing input rates make token-based calls unpriced; reranking has its own price group.
 */
export function PriceSource({ price }: { price: Price }) {
    return (
        <span className="inline-flex items-center gap-1">
            <SourceName price={price} />
            {price.observed && price.rates.input === null ? (
                <InfoHint
                    label="Why token calls show as Unpriced"
                    className="text-warning"
                >
                    Token calls without an input rate show as Unpriced.
                </InfoHint>
            ) : null}
        </span>
    )
}

function SourceName({ price }: { price: Price }) {
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
            return <span className="block">No rate</span>
    }
}
