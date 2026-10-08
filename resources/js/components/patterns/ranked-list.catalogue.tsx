import { MemoryRouter } from 'react-router'
import { Panel } from '@/components/patterns/panel'
import { PanelContent } from '@/components/patterns/panel-content'
import { PanelHeader } from '@/components/patterns/panel-header'
import { RankedList } from '@/components/patterns/ranked-list'
import { RankedListItem } from '@/components/patterns/ranked-list-item'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Ranked list',
    specimens: [
        {
            name: 'In a panel, with links and details',
            Component: () => (
                <MemoryRouter>
                    <Panel className="max-w-md">
                        <PanelHeader title="Top models" />
                        <PanelContent>
                            <RankedList>
                                <RankedListItem
                                    label="gpt-5"
                                    value="$8.20"
                                    share={0.66}
                                    to="/traces?model=gpt-5"
                                    detail="812 runs"
                                />
                                <RankedListItem
                                    label="claude-sonnet"
                                    value="$3.10"
                                    share={0.25}
                                    to="/traces?model=claude-sonnet"
                                />
                                <RankedListItem
                                    label="text-embedding-3-small"
                                    value="$0.04"
                                    share={0.004}
                                />
                            </RankedList>
                        </PanelContent>
                    </Panel>
                </MemoryRouter>
            ),
        },
        {
            name: 'Shares of 0, 1 and not known (no bar at all)',
            Component: () => (
                <RankedList className="max-w-md">
                    <RankedListItem label="Everything" value="10" share={1} />
                    <RankedListItem label="Nothing" value="0" share={0} />
                    <RankedListItem
                        label="Share not known"
                        value="Unpriced"
                        share={null}
                    />
                </RankedList>
            ),
        },
        {
            name: 'A long label wraps',
            Component: () => (
                <RankedList className="max-w-60">
                    <RankedListItem
                        label="Rate limit exceeded on the provider side, retried twice"
                        value="12"
                        share={0.4}
                    />
                </RankedList>
            ),
        },
    ],
}
