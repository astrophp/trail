import { ExportLinkButton } from '@/components/patterns/export-link-button'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Export link button',
    specimens: [
        {
            name: 'Export, as in a page header',
            Component: () => <ExportLinkButton href="#export" />,
        },
        {
            name: 'Small, with its own words and a name that says what is exported (as in a panel)',
            Component: () => (
                <ExportLinkButton
                    href="#export"
                    size="sm"
                    label="Export the breakdown by model as CSV"
                    title="Up to 1,000 rows"
                >
                    Export CSV
                </ExportLinkButton>
            ),
        },
    ],
}
