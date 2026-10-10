import type { Span } from '@/api/types'
import { StoredPayload } from '@/components/telemetry/stored-payload'

type WholeOutputProps = { span: Span }

/** The output exactly as stored: for one that is not shaped the way its type stores it. */
export function WholeOutput({ span }: WholeOutputProps) {
    return (
        <StoredPayload
            span={span}
            path="output"
            label="output"
            value={span.output}
        />
    )
}
