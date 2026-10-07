import { ModelLabel } from '@/components/telemetry/model-label'
import type { Trace } from '@/api/types'
import type { CatalogueEntry } from '@/catalogue/types'

const models: [string, Pick<Trace, 'provider' | 'model' | 'streamed'>][] = [
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
    ['Neither', { model: null, provider: null, streamed: false }],
]

export const catalogue: CatalogueEntry = {
    title: 'Model label',
    specimens: models.map(([name, of]) => ({
        name,
        Component: () => <ModelLabel of={of} />,
    })),
}
