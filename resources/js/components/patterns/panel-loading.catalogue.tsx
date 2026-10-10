import { Panel } from '@/components/patterns/panel'
import { PanelContent } from '@/components/patterns/panel-content'
import { PanelHeader } from '@/components/patterns/panel-header'
import { PanelLoading } from '@/components/patterns/panel-loading'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Panel loading',
    specimens: [
        {
            name: 'In a panel',
            Component: () => (
                <Panel>
                    <PanelHeader title="Trace activity" />
                    <PanelContent>
                        <PanelLoading />
                    </PanelContent>
                </Panel>
            ),
        },
        {
            name: 'Five rows',
            Component: () => (
                <Panel>
                    <PanelContent>
                        <PanelLoading rows={5} />
                    </PanelContent>
                </Panel>
            ),
        },
    ],
}
