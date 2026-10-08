import { StepOptions } from '@/components/telemetry/step-options'
import type { CatalogueEntry } from '@/catalogue/types'

const span = { truncated_paths: {} }

export const catalogue: CatalogueEntry = {
    title: 'Step options',
    specimens: [
        {
            name: 'Scalars and a structured option',
            Component: () => (
                <StepOptions
                    span={span}
                    options={{
                        temperature: 0.2,
                        max_tokens: 1024,
                        tool_choice: { type: 'auto' },
                        seed: null,
                    }}
                />
            ),
        },
        {
            name: 'Every option null (nothing shown)',
            Component: () => (
                <StepOptions span={span} options={{ temperature: null }} />
            ),
        },
    ],
}
