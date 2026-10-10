import { Panel } from '@/components/patterns/panel'
import { PanelContent } from '@/components/patterns/panel-content'
import { PanelError } from '@/components/patterns/panel-error'
import { PanelHeader } from '@/components/patterns/panel-header'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Panel error',
    specimens: [
        {
            name: 'With a retry',
            Component: () => (
                <Panel>
                    <PanelHeader title="Trace activity" />
                    <PanelContent>
                        <PanelError
                            message="The server could not be reached. Check the connection and try again."
                            onRetry={() => {}}
                        />
                    </PanelContent>
                </Panel>
            ),
        },
        {
            name: 'Without a retry',
            Component: () => (
                <Panel>
                    <PanelContent>
                        <PanelError
                            title="Could not load this"
                            message="The request was refused."
                        />
                    </PanelContent>
                </Panel>
            ),
        },
    ],
}
