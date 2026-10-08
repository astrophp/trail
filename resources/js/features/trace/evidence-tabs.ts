import type { Span } from '@/api/types'
import { inputShape, outputShape } from '@/features/trace/payload-shape'

export const tabIds = ['input', 'output', 'metadata', 'raw'] as const

export type TabId = (typeof tabIds)[number]

export const tabLabels: Record<TabId, string> = {
    input: 'Input',
    output: 'Output',
    metadata: 'Metadata',
    raw: 'Raw',
}

/**
 * The tabs a span has, in order: only those with something to show for its type (see
 * `payload-shape`). Metadata and Raw always exist.
 */
export function availableTabs(
    span: Pick<Span, 'type' | 'input' | 'output'>,
): TabId[] {
    return tabIds.filter(
        (id) =>
            (id !== 'input' || inputShape(span).kind !== 'none') &&
            (id !== 'output' || outputShape(span).kind !== 'none'),
    )
}

/** The tab to show: the requested one when the span has it, otherwise the span's first. */
export function activeTab(requested: string, available: TabId[]): TabId {
    return available.find((id) => id === requested) ?? available[0]
}
