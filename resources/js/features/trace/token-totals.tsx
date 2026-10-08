import type { Usage } from '@/api/types'
import { KeyValueList } from '@/components/patterns/key-value-list'
import { TokenBreakdown } from '@/components/telemetry/token-breakdown'
import { RunPanel } from '@/features/trace/run-panel'

/** The run's tokens as the server counted them: cache and reasoning are parts of input and output, not added on top. */
export function TokenTotals({ usage }: { usage: Usage }) {
    return (
        <RunPanel title="Token breakdown">
            <KeyValueList layout="rows">
                <TokenBreakdown usage={usage} layout="rows" />
            </KeyValueList>
        </RunPanel>
    )
}
