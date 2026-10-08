import { TokenBreakdown } from '@/components/telemetry/token-breakdown'
import type { Usage } from '@/api/types'
import type { CatalogueEntry } from '@/catalogue/types'

const none: Usage = {
    state: 'not_reported',
    input_tokens: null,
    output_tokens: null,
    cache_read_tokens: null,
    cache_write_tokens: null,
    reasoning_tokens: null,
    total_tokens: null,
}

const usages: [string, Usage][] = [
    [
        'Reported',
        {
            state: 'reported',
            input_tokens: 1_200,
            output_tokens: 310,
            cache_read_tokens: 800,
            cache_write_tokens: 100,
            reasoning_tokens: 90,
            total_tokens: 1_510,
        },
    ],
    [
        'Some counts not reported',
        {
            ...none,
            state: 'reported',
            input_tokens: 1_200,
            output_tokens: 310,
            total_tokens: 1_510,
        },
    ],
    ['Pending', { ...none, state: 'pending', input_tokens: 1_200 }],
    ['Not reported', none],
]

export const catalogue: CatalogueEntry = {
    title: 'Token breakdown',
    specimens: usages.map(([name, usage]) => ({
        name,
        Component: () => <TokenBreakdown usage={usage} className="max-w-xs" />,
    })),
}
