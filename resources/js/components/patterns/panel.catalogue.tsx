import { Panel } from '@/components/patterns/panel'
import { PanelContent } from '@/components/patterns/panel-content'
import { PanelFooter } from '@/components/patterns/panel-footer'
import { PanelHeader } from '@/components/patterns/panel-header'
import { Button } from '@/components/ui/button'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Panel',
    specimens: [
        {
            name: 'Header, content and footer',
            Component: () => (
                <Panel>
                    <PanelHeader
                        title="Trace activity"
                        description="Recorded runs over time"
                    />
                    <PanelContent>
                        <p className="text-ui">Anything goes here.</p>
                    </PanelContent>
                    <PanelFooter>Within the selected time period</PanelFooter>
                </Panel>
            ),
        },
        {
            name: 'With an action',
            Component: () => (
                <Panel>
                    <PanelHeader
                        title="Needs attention"
                        action={
                            <Button variant="outline" size="sm">
                                View all
                            </Button>
                        }
                    />
                    <PanelContent>
                        <p className="text-ui">Three things to look at.</p>
                    </PanelContent>
                </Panel>
            ),
        },
        {
            name: 'A long title and description in a narrow panel, with an action',
            Component: () => (
                <Panel className="max-w-xs">
                    <PanelHeader
                        title="Estimated cost by model and provider"
                        description="Estimates from the prices on this page, not invoices"
                        action={
                            <Button variant="outline" size="sm">
                                Export
                            </Button>
                        }
                    />
                    <PanelContent>
                        <p className="text-ui">Content.</p>
                    </PanelContent>
                </Panel>
            ),
        },
        {
            name: 'Content only',
            Component: () => (
                <Panel>
                    <PanelContent>
                        <p className="text-ui">A panel without a header.</p>
                    </PanelContent>
                </Panel>
            ),
        },
    ],
}
