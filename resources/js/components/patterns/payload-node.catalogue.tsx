import { PayloadNode } from '@/components/patterns/payload-node'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Payload node',
    specimens: [
        {
            name: 'Leaves by kind',
            Component: () => (
                <div className="font-mono text-caption">
                    <PayloadNode
                        name="string"
                        value="text"
                        redactionMarker="[redacted]"
                    />
                    <PayloadNode
                        name="number"
                        value={42}
                        redactionMarker="[redacted]"
                    />
                    <PayloadNode
                        name="boolean"
                        value={true}
                        redactionMarker="[redacted]"
                    />
                    <PayloadNode
                        name="null"
                        value={null}
                        redactionMarker="[redacted]"
                    />
                </div>
            ),
        },
        {
            name: 'Container',
            Component: () => (
                <div className="font-mono text-caption">
                    <PayloadNode
                        name="payload"
                        value={{ a: 1, b: ['x', 'y'], c: {} }}
                        redactionMarker="[redacted]"
                    />
                </div>
            ),
        },
    ],
}
