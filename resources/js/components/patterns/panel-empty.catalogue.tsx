import { Panel } from '@/components/patterns/panel'
import { PanelContent } from '@/components/patterns/panel-content'
import { PanelEmpty } from '@/components/patterns/panel-empty'
import { PanelHeader } from '@/components/patterns/panel-header'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Panel empty',
    specimens: [
        {
            name: 'Title and description',
            Component: () => (
                <Panel>
                    <PanelHeader title="Needs attention" />
                    <PanelContent>
                        <PanelEmpty
                            title="Nothing needs attention"
                            description="No failed or incomplete runs in this period."
                        />
                    </PanelContent>
                </Panel>
            ),
        },
        {
            name: 'Title only',
            Component: () => (
                <Panel>
                    <PanelContent>
                        <PanelEmpty title="No runs in this period" />
                    </PanelContent>
                </Panel>
            ),
        },
    ],
}
