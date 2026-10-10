import type { AgentSubtotal, Cost, Span, SpanCost, Usage } from '@/api/types'

export type SpanBilling = { usage: Usage; cost: Cost | SpanCost }

/**
 * What a span used, as the server counted it. A step or an embedding carries its own. An agent's
 * is the server's subtotal for that span (`usage.agents` of the response, which leaves out the
 * agents it delegated to), passed as `subtotal`. Nothing is added up here. Tools, and an agent
 * without a subtotal, do not bill.
 */
export function spanBilling(
    span: Span,
    subtotal: AgentSubtotal | undefined,
): SpanBilling | null {
    if (span.type === 'agent') {
        return subtotal ? { usage: subtotal.usage, cost: subtotal.cost } : null
    }

    return span.usage !== null && span.cost !== null
        ? { usage: span.usage, cost: span.cost }
        : null
}
