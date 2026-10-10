import { NounCount } from '@/components/telemetry/noun-count'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Noun count',
    specimens: [
        {
            name: 'One, many, zero, not captured',
            Component: () => (
                <div className="flex flex-col gap-1 text-ui">
                    {[1, 1204, 0, null].map((count) => (
                        <NounCount
                            key={String(count)}
                            count={count}
                            singular="run"
                            plural="runs"
                        />
                    ))}
                </div>
            ),
        },
    ],
}
