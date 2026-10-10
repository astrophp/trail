import type { Status } from '@/api/types'
import type { SpanTree } from '@/features/trace/build-span-tree'
import {
    activeTab,
    availableTabs,
    tabLabels,
    type TabId,
} from '@/features/trace/evidence-tabs'
import { resolveSelection } from '@/features/trace/resolve-selection'

/**
 * What a link asked for that this run cannot give: a span it does not have, or a tab the span
 * does not have. `patch` clears the stale parameters from the URL; `shown` is the tab that
 * replaces the missing one.
 */
export type StaleLink =
    | { kind: 'span'; patch: { span: ''; tab: '' } }
    | { kind: 'tab'; patch: { tab: '' }; shown: TabId }

/** Whether the span and tab the URL names are in the run; `null` when they both are, or are not named. */
export function staleLink(
    tree: SpanTree,
    status: Status,
    span: string,
    tab: string,
): StaleLink | null {
    if (span !== '' && !tree.byId.has(span)) {
        return { kind: 'span', patch: { span: '', tab: '' } }
    }

    const selectedId = resolveSelection(tree, span, status)
    const selected = selectedId === null ? undefined : tree.byId.get(selectedId)

    if (selected === undefined || tab === '') {
        return null
    }

    const available = availableTabs(selected.span)

    return available.some((id) => id === tab)
        ? null
        : {
              kind: 'tab',
              patch: { tab: '' },
              shown: activeTab(tab, available),
          }
}

/** What the page says about a stale link; a run cut at the span limit may simply not have shown the span. */
export function staleLinkText(stale: StaleLink, truncated: boolean): string {
    return stale.kind === 'span'
        ? `The span this link pointed to is not in this run. Showing the default selection.${truncated ? ' It may be beyond the spans shown.' : ''}`
        : `That tab is not available for this span. Showing ${tabLabels[stale.shown]}.`
}
