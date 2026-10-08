import { Panel } from '@/components/patterns/panel'
import { PanelContent } from '@/components/patterns/panel-content'
import { PanelFooter } from '@/components/patterns/panel-footer'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Panel footer',
    specimens: [
        {
            name: 'A note',
            Component: () => (
                <Panel>
                    <PanelContent>
                        <p className="text-ui">Content.</p>
                    </PanelContent>
                    <PanelFooter>Within the selected time period</PanelFooter>
                </Panel>
            ),
        },
    ],
}
