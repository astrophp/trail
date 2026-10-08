import { CopyButton } from '@/components/patterns/copy-button'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Copy button',
    specimens: [
        {
            name: 'Copies a text (the check shows for a moment)',
            Component: () => (
                <CopyButton
                    text="0199c2f4-6a1e-7c3b-9a55-0e8a4c1d2f30"
                    label="Copy run id"
                />
            ),
        },
    ],
}
