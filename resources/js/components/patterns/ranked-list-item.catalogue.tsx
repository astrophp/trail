import { MemoryRouter } from 'react-router'
import { RankedList } from '@/components/patterns/ranked-list'
import { RankedListItem } from '@/components/patterns/ranked-list-item'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Ranked list item',
    specimens: [
        {
            name: 'With a share',
            Component: () => (
                <RankedList className="max-w-md">
                    <RankedListItem
                        label="search_web"
                        value="412"
                        share={0.5}
                    />
                </RankedList>
            ),
        },
        {
            name: 'Without a share',
            Component: () => (
                <RankedList className="max-w-md">
                    <RankedListItem
                        label="search_web"
                        value="412"
                        share={null}
                    />
                </RankedList>
            ),
        },
        {
            name: 'A link with a detail (the whole item is the target)',
            Component: () => (
                <MemoryRouter>
                    <RankedList className="max-w-md">
                        <RankedListItem
                            label="search_web"
                            value="412"
                            share={0.5}
                            to="/traces"
                            detail="Called by 3 agents"
                        />
                    </RankedList>
                </MemoryRouter>
            ),
        },
    ],
}
