import { Panel } from '@/components/patterns/panel'
import { PanelContent } from '@/components/patterns/panel-content'
import { PanelHeader } from '@/components/patterns/panel-header'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Panel content',
    specimens: [
        {
            name: 'Under a header',
            Component: () => (
                <Panel>
                    <PanelHeader title="Notes" />
                    <PanelContent>
                        <p className="text-ui">Content under a header.</p>
                    </PanelContent>
                </Panel>
            ),
        },
        {
            name: 'Without side padding, for content that fills the width',
            Component: () => (
                <Panel>
                    <PanelHeader title="Notes" />
                    <PanelContent className="px-0">
                        <p className="border-y px-5 py-3 text-ui">
                            A row that runs edge to edge.
                        </p>
                    </PanelContent>
                </Panel>
            ),
        },
    ],
}
