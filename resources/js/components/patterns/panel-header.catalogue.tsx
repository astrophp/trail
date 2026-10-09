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
        {
            name: 'A title a link can focus (an id and tabindex -1)',
            Component: () => (
                <Panel>
                    <PanelHeader
                        title="Model prices"
                        titleTarget={{ id: 'catalogue-model-prices' }}
                        description="Reached by an in-page link"
                    />
                </Panel>
            ),
        },
    ],
}
