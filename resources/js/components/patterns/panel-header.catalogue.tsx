import { Panel } from '@/components/patterns/panel'
import { PanelHeader } from '@/components/patterns/panel-header'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Panel header',
    specimens: [
        {
            name: 'Title only',
            Component: () => (
                <Panel>
                    <PanelHeader title="Top models" />
                </Panel>
            ),
        },
        {
            name: 'Title and description, as a level 3 heading',
            Component: () => (
                <Panel>
                    <PanelHeader
                        title="Top models"
                        headingLevel={3}
                        description="By number of runs"
                    />
                </Panel>
            ),
        },
    ],
}
