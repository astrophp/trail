import { CountChip } from '@/components/patterns/count-chip'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Count chip',
    specimens: [
        {
            name: 'States',
            Component: () => (
                <div className="flex flex-wrap items-center gap-3 text-ui">
                    <span className="flex items-center gap-2">
                        Counted <CountChip count={1284} />
                    </span>
                    <span className="flex items-center gap-2">
                        Zero <CountChip count={0} />
                    </span>
                    <span className="flex items-center gap-2">
                        Active <CountChip count={12} active />
                    </span>
                    <span className="flex items-center gap-2">
                        Unknown (no chip) <CountChip />
                    </span>
                </div>
            ),
        },
    ],
}
