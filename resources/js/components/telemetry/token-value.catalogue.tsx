import { TokenValue } from '@/components/telemetry/token-value'
import type { Usage } from '@/api/types'
import type { CatalogueEntry } from '@/catalogue/types'

const none: Usage = {
    state: 'reported',
    input_tokens: null,
    output_tokens: null,
    cache_read_tokens: null,
    cache_write_tokens: null,
    reasoning_tokens: null,
    total_tokens: null,
}

const usages: [string, Usage][] = [
    ['Reported, small', { ...none, total_tokens: 842 }],
    ['Reported, thousands', { ...none, total_tokens: 9_432 }],
    ['Reported, millions', { ...none, total_tokens: 1_234_567 }],
    ['Pending', { ...none, state: 'pending' }],
    [
        'Pending, with counts so far',
        { ...none, state: 'pending', input_tokens: 1_200, total_tokens: 1_200 },
    ],
    ['Not reported', { ...none, state: 'not_reported' }],
    [
        'Reported without a total',
        { ...none, cache_read_tokens: 120, reasoning_tokens: 40 },
    ],
]

export const catalogue: CatalogueEntry = {
    title: 'Token value',
    specimens: usages.map(([name, usage]) => ({
        name,
        Component: () => <TokenValue usage={usage} />,
    })),
}
