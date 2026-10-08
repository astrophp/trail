import { ModelLabel } from '@/components/telemetry/model-label'
import type { ComponentProps } from 'react'
import type { CatalogueEntry } from '@/catalogue/types'

type Of = ComponentProps<typeof ModelLabel>['of']

const models: [string, Of, boolean?][] = [
    [
        'Model and provider',
        { model: 'gpt-4o', provider: 'openai', streamed: false },
    ],
    [
        'Streamed',
        { model: 'claude-3-5-sonnet', provider: 'anthropic', streamed: true },
    ],
    ['No model', { model: null, provider: 'openai', streamed: false }],
    ['No provider', { model: 'gpt-4o', provider: null, streamed: true }],
    ['Span (no streamed field)', { model: 'gpt-4o', provider: 'openai' }],
    ['Neither', { model: null, provider: null, streamed: false }],
    [
        'Responding model differs',
        {
            model: 'claude-sonnet-4-5',
            provider: 'anthropic',
            responding_model: 'claude-sonnet-4-5-20250929',
        },
        true,
    ],
    [
        'Responding model same',
        { model: 'gpt-4o', provider: 'openai', responding_model: 'gpt-4o' },
        true,
    ],
    [
        'Responding model not captured',
        { model: 'gpt-4o', provider: 'openai', responding_model: null },
        true,
    ],
]

export const catalogue: CatalogueEntry = {
    title: 'Model label',
    specimens: models.map(([name, of, expectResponding]) => ({
        name,
        Component: () => (
            <ModelLabel of={of} expectResponding={expectResponding} />
        ),
    })),
}
