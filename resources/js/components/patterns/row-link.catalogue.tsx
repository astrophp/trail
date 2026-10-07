import { MemoryRouter } from 'react-router'
import { RowLink } from '@/components/patterns/row-link'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Row link',
    specimens: [
        {
            name: 'In a positioned container (the whole box is the target; hover it, Tab to it)',
            Component: () => (
                <MemoryRouter>
                    <div className="relative w-fit rounded-lg border p-4 text-ui">
                        <RowLink to="/fruit/apple">Apple</RowLink>
                        <p className="text-muted-foreground">
                            Anywhere in this box follows the link.
                        </p>
                    </div>
                </MemoryRouter>
            ),
        },
    ],
}
