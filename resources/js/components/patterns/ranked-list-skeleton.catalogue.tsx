import { Panel } from '@/components/patterns/panel'
import { PanelContent } from '@/components/patterns/panel-content'
import { PanelHeader } from '@/components/patterns/panel-header'
import { RankedListSkeleton } from '@/components/patterns/ranked-list-skeleton'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Ranked list skeleton',
    specimens: [
        {
            name: 'In a panel',
            Component: () => (
                <Panel className="max-w-md">
                    <PanelHeader title="Top models" />
                    <PanelContent>
                        <RankedListSkeleton />
                    </PanelContent>
                </Panel>
            ),
        },
        {
            name: 'Five',
            Component: () => (
                <RankedListSkeleton count={5} className="max-w-md" />
            ),
        },
    ],
}
