import { Change } from '@/components/patterns/change'
import { formatCost } from '@/lib/format'
import type { CatalogueEntry } from '@/catalogue/types'

const caption = 'vs previous 24h'

export const catalogue: CatalogueEntry = {
    title: 'Change',
    specimens: [
        {
            name: 'Relative: up and down, when up is good',
            Component: () => (
                <div className="flex flex-col gap-2">
                    <Change
                        mode="relative"
                        polarity="up-is-good"
                        current={1284}
                        previous={1140}
                        caption={caption}
                    />
                    <Change
                        mode="relative"
                        polarity="up-is-good"
                        current={900}
                        previous={1140}
                        caption={caption}
                    />
                </div>
            ),
        },
        {
            name: 'Relative: up and down, when up is bad',
            Component: () => (
                <div className="flex flex-col gap-2">
                    <Change
                        mode="relative"
                        polarity="up-is-bad"
                        current={27}
                        previous={12}
                        caption={caption}
                    />
                    <Change
                        mode="relative"
                        polarity="up-is-bad"
                        current={5}
                        previous={12}
                        caption={caption}
                    />
                </div>
            ),
        },
        {
            name: 'Relative: neutral polarity',
            Component: () => (
                <div className="flex flex-col gap-2">
                    <Change
                        mode="relative"
                        polarity="neutral"
                        current={1284}
                        previous={1140}
                    />
                    <Change
                        mode="relative"
                        polarity="neutral"
                        current={900}
                        previous={1140}
                    />
                </div>
            ),
        },
        {
            name: 'Percentage points (fractions in, "pp" out)',
            Component: () => (
                <div className="flex flex-col gap-2">
                    <Change
                        mode="points"
                        polarity="up-is-bad"
                        current={0.021}
                        previous={0.036}
                        caption={caption}
                    />
                    <Change
                        mode="points"
                        polarity="up-is-bad"
                        current={0.051}
                        previous={0.036}
                        caption={caption}
                    />
                </div>
            ),
        },
        {
            name: 'Absolute, drawn by the caller',
            Component: () => (
                <div className="flex flex-col gap-2">
                    <Change
                        mode="absolute"
                        polarity="up-is-bad"
                        current={12.4}
                        previous={9.1}
                        renderDifference={formatCost}
                        caption={caption}
                    />
                    <Change
                        mode="absolute"
                        polarity="up-is-bad"
                        current={9.1}
                        previous={12.4}
                        renderDifference={formatCost}
                        caption={caption}
                    />
                </div>
            ),
        },
        {
            name: 'Relative, previous was 0: the difference when it can be drawn, else the label',
            Component: () => (
                <div className="flex flex-col gap-2">
                    <Change
                        mode="relative"
                        polarity="up-is-bad"
                        current={3}
                        previous={0}
                        renderDifference={(size) => `${size} more`}
                        caption={caption}
                    />
                    <Change
                        mode="relative"
                        polarity="up-is-bad"
                        current={3}
                        previous={0}
                        caption={caption}
                    />
                </div>
            ),
        },
        {
            name: 'No change, no earlier data, a sliver',
            Component: () => (
                <div className="flex flex-col gap-2">
                    <Change
                        mode="relative"
                        polarity="up-is-good"
                        current={40}
                        previous={40}
                        caption={caption}
                    />
                    <Change
                        mode="relative"
                        polarity="up-is-good"
                        current={40}
                        previous={null}
                        caption={caption}
                    />
                    <Change
                        mode="relative"
                        polarity="up-is-good"
                        current={1000001}
                        previous={1000000}
                        caption={caption}
                    />
                    <Change
                        mode="points"
                        polarity="up-is-bad"
                        current={0.50004}
                        previous={0.5}
                    />
                </div>
            ),
        },
        {
            name: 'No current value: nothing is drawn',
            Component: () => (
                <p className="text-ui text-muted-foreground">
                    [
                    <Change
                        mode="relative"
                        polarity="up-is-good"
                        current={null}
                        previous={40}
                    />
                    ]
                </p>
            ),
        },
    ],
}
