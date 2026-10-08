import { CappedText } from '@/components/patterns/capped-text'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Capped text',
    specimens: [
        {
            name: 'Short',
            Component: () => (
                <CappedText text="A short text." redactionMarker="[redacted]" />
            ),
        },
        {
            name: 'Long, revealed in steps',
            Component: () => (
                <div className="font-mono text-caption">
                    <CappedText
                        text={'Lorem ipsum dolor sit amet. '.repeat(400)}
                        redactionMarker="[redacted]"
                    />
                </div>
            ),
        },
        {
            name: 'With a redaction marker',
            Component: () => (
                <CappedText
                    text="Authorization: Bearer [redacted]"
                    redactionMarker="[redacted]"
                />
            ),
        },
    ],
}
