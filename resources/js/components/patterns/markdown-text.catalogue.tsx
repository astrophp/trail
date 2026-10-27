import { MarkdownText } from '@/components/patterns/markdown-text'
import type { CatalogueEntry } from '@/catalogue/types'

const long = Array.from(
    { length: 80 },
    (_, index) =>
        `### Section ${index + 1}\n\n- A point about part ${index + 1}\n- Another point`,
).join('\n\n')

export const catalogue: CatalogueEntry = {
    title: 'Markdown text',
    specimens: [
        {
            name: 'Short',
            Component: () => (
                <MarkdownText
                    text="A **short** answer."
                    redactionMarker="[redacted]"
                    className="text-ui"
                />
            ),
        },
        {
            name: 'Long, revealed in steps',
            Component: () => (
                <MarkdownText
                    text={long}
                    redactionMarker="[redacted]"
                    className="text-ui"
                />
            ),
        },
    ],
}
