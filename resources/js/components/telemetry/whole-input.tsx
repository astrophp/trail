import type { Span } from '@/api/types'
import { StoredPayload } from '@/components/telemetry/stored-payload'

type WholeInputProps = { span: Span }

/** The input exactly as stored: for one that is not shaped the way its type stores it. */
export function WholeInput({ span }: WholeInputProps) {
    return (
        <StoredPayload
            span={span}
            path="input"
            label="input"
            value={span.input}
        />
    )
}
