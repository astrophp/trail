import type { CatalogueEntry } from '@/catalogue/types'
import { CapabilityPanel } from '@/features/trace/capability-panel'
import { stepSpan } from '@/catalogue/step-span'
import type { Span } from '@/api/types'

const makeStepSpan = (id: string, patch: Partial<Span>): Span => ({
    ...stepSpan(null),
    id,
    ...patch,
})

export const catalogue: CatalogueEntry = {
    title: 'Capability evidence',
    specimens: [
        {
            name: 'Classification answers',
            Component: () => (
                <CapabilityPanel
                    side="output"
                    span={makeStepSpan('class', {
                        type: 'classification',
                        sequence: 1,
                        output: {
                            answer_count: 3,
                            answers: {
                                valid: { type: 'boolean', probability: 0.7 },
                                category: {
                                    type: 'choice',
                                    choice: 'returns',
                                    probabilities: {
                                        returns: 0.8,
                                        shipping: 0.2,
                                    },
                                    confidence: null,
                                },
                                urgency: {
                                    type: 'score',
                                    score: 0.75,
                                    probabilities: [0.25, 0.75],
                                    legend: ['low', 'high'],
                                    confidence: 0.6,
                                },
                            },
                            omitted_entries: 0,
                        },
                    })}
                />
            ),
        },
        {
            name: 'Ranked documents',
            Component: () => (
                <CapabilityPanel
                    side="output"
                    span={makeStepSpan('rank', {
                        type: 'reranking',
                        sequence: 1,
                        output: {
                            result_count: 2,
                            results: [
                                { index: 2, score: 0.92 },
                                { index: 0, score: 0.34 },
                            ],
                            omitted_entries: 1,
                        },
                    })}
                />
            ),
        },
        {
            name: 'Capture disabled',
            Component: () => (
                <CapabilityPanel
                    side="input"
                    span={makeStepSpan('rank-off', {
                        type: 'reranking',
                        sequence: 1,
                        input: { document_count: 3, limit: 2 },
                    })}
                />
            ),
        },
    ],
}
