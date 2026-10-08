import { WholeInput } from '@/components/telemetry/whole-input'
import { stepSpan } from '@/catalogue/step-span'
import type { CatalogueEntry } from '@/catalogue/types'

export const catalogue: CatalogueEntry = {
    title: 'Whole input',
    specimens: [
        {
            name: 'An input of another shape, as stored',
            Component: () => (
                <WholeInput
                    span={stepSpan({ unexpected: 'shape', items: [1, 2, 3] })}
                />
            ),
        },
        {
            name: 'Cut short',
            Component: () => (
                <WholeInput
                    span={stepSpan('A long input that was cut', {
                        input: 5000,
                    })}
                />
            ),
        },
    ],
}
