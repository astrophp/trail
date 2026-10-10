import { describe, expect, it } from 'vitest'
import {
    makeAgentSpan,
    makeEmbeddingSpan,
    makeStepSpan,
    makeToolSpan,
} from '@/test/trace-api'
import { countSpans } from '@/features/compare/span-counts'

describe('countSpans', () => {
    it('counts the spans by type, status and the highest attempt', () => {
        const counts = countSpans([
            makeAgentSpan('root', { sequence: 1 }),
            makeStepSpan('s1', { sequence: 2, attempt: 1, status: 'failed' }),
            makeStepSpan('s2', {
                sequence: 3,
                attempt: 2,
                status: 'completed',
            }),
            makeToolSpan('t1', { sequence: 4, status: 'incomplete' }),
            makeEmbeddingSpan('e1', { sequence: 5, status: 'completed' }),
        ])

        expect(counts).toEqual({
            agents: 1,
            steps: 2,
            tools: 1,
            embeddings: 1,
            attempts: 2,
            failed: 1,
            incomplete: 1,
        })
    })

    it('has no attempt number for a run without spans, not a zero', () => {
        expect(countSpans([]).attempts).toBeNull()
    })
})
