import { PayloadViewer } from '@/components/patterns/payload-viewer'
import type { CatalogueEntry } from '@/catalogue/types'

const object = {
    city: 'Oslo',
    days: 3,
    metric: true,
    note: null,
    tags: ['rain', 'wind'],
}

const nested = { a: { b: { c: { d: 'deep value' } } } }

export const catalogue: CatalogueEntry = {
    title: 'Payload viewer',
    specimens: [
        {
            name: 'Text',
            Component: () => (
                <PayloadViewer
                    label="output"
                    value="The forecast for Oslo is rain, with wind from the west."
                />
            ),
        },
        {
            name: 'Object',
            Component: () => <PayloadViewer label="arguments" value={object} />,
        },
        {
            name: 'Array',
            Component: () => (
                <PayloadViewer
                    label="results"
                    value={['first', 'second', 3, false, null]}
                />
            ),
        },
        {
            name: 'Nested, deeper levels start collapsed',
            Component: () => <PayloadViewer label="arguments" value={nested} />,
        },
        {
            name: 'Large: a long string and a long array',
            Component: () => (
                <div className="flex flex-col gap-4">
                    <PayloadViewer
                        label="output"
                        value={'A long line of text. '.repeat(600)}
                    />
                    <PayloadViewer
                        label="results"
                        value={Array.from(
                            { length: 500 },
                            (_, i) => `item ${i}`,
                        )}
                    />
                </div>
            ),
        },
        {
            name: 'Redacted',
            Component: () => (
                <PayloadViewer
                    label="arguments"
                    redacted
                    value={{ user: 'ada', api_key: '[redacted]' }}
                />
            ),
        },
        {
            name: 'Truncated, with and without the original length',
            Component: () => (
                <div className="flex flex-col gap-4">
                    <PayloadViewer
                        label="output"
                        truncated
                        originalLength={12000}
                        value="The beginning of a long answer"
                    />
                    <PayloadViewer
                        label="output"
                        truncated
                        value="The beginning of a long answer"
                    />
                </div>
            ),
        },
        {
            name: 'Not captured',
            Component: () => (
                <div className="flex flex-col gap-2">
                    <PayloadViewer label="arguments" value={undefined} />
                    <PayloadViewer
                        label="output"
                        value={null}
                        missingReason="The tool did not finish."
                    />
                </div>
            ),
        },
    ],
}
