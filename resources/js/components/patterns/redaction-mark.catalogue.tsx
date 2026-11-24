import { RedactionMark } from '@/components/patterns/redaction-mark'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Redaction mark',
    specimens: [
        {
            name: 'In a sentence',
            Component: () => (
                <p className="text-ui">
                    The key was <RedactionMark text="[redacted]" /> when it was
                    stored.
                </p>
            ),
        },
    ],
}
