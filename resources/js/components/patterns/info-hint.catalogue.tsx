import { InfoHint } from '@/components/patterns/info-hint'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Info hint',
    specimens: [
        {
            name: 'Beside a title',
            Component: () => (
                <h2 className="flex items-center gap-1.5 text-heading">
                    Model prices
                    <InfoHint label="About model prices">
                        A saved price applies to runs recorded from now on.
                    </InfoHint>
                </h2>
            ),
        },
    ],
}
