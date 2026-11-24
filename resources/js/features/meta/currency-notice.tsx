import { Code } from '@/components/patterns/code'
import { Notice } from '@/components/patterns/notice'
import { currencyCode } from '@/lib/format'

/**
 * Says the install's currency setting is not valid, on every page, for as long as it is. There is
 * nothing to dismiss: it is fixed in the configuration, and the notice goes with the next load.
 */
export function CurrencyNotice() {
    if (currencyCode() !== null) {
        return null
    }

    return (
        <Notice
            tone="warning"
            title="Currency setting is not valid"
            className="mb-4"
        >
            Amounts are shown without a currency, and bundled prices are not
            used, until <Code>trail.currency</Code> is a three-letter ISO 4217
            code such as <Code>USD</Code>.
        </Notice>
    )
}
