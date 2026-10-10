import type { Status } from '@/api/types'
import type { SpanTree } from '@/features/trace/build-span-tree'
import {
    activeTab,
    availableTabs,
    type TabId,
} from '@/features/trace/evidence-tabs'
import { resolveSelection } from '@/features/trace/resolve-selection'
import type { ViewId } from '@/features/trace/trace-params'

/** What is on screen of a run: the view, the selected span and the tab shown for it. */
export type Shown = {
    view: ViewId
    /** The selected span; empty for a run without spans. */
    span: string
    /** The tab the span's evidence is on; empty without a span. */
    tab: TabId | ''
}

/**
 * What the page shows for what the URL asks for: the span that is selected (the requested one
 * when the run has it, otherwise the page's own choice; see `resolveSelection`) and the tab that
 * is open for it (the requested one when the span has it, otherwise its first).
 */
export function shownSelection(
    tree: SpanTree,
    status: Status,
    asked: { view: ViewId; span: string; tab: string },
): { selectedId: string | null; shown: Shown } {
    const selectedId = resolveSelection(tree, asked.span, status)
    const selected = selectedId === null ? undefined : tree.byId.get(selectedId)

    return {
        selectedId,
        shown: {
            view: asked.view,
            span: selectedId ?? '',
            tab: selected
                ? activeTab(asked.tab, availableTabs(selected.span))
                : '',
        },
    }
}
