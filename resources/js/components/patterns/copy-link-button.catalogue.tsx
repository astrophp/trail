import { MemoryRouter } from 'react-router'
import { CopyLinkButton } from '@/components/patterns/copy-link-button'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Copy link button',
    specimens: [
        {
            name: 'Outlined, as in a page header',
            Component: () => (
                <MemoryRouter>
                    <CopyLinkButton to="/traces/run-1?span=s2" />
                </MemoryRouter>
            ),
        },
        {
            name: 'Quiet and small, with a name that says which link (as under a turn)',
            Component: () => (
                <MemoryRouter>
                    <CopyLinkButton
                        to="/conversations/transcript?id=c-1&turn=run-3"
                        label="Copy link to turn 3"
                        variant="ghost"
                        size="xs"
                    />
                </MemoryRouter>
            ),
        },
    ],
}
