import { describe, expect, it } from 'vitest'
import { traceParams } from '@/features/trace/trace-params'
import { tracePagePath } from '@/lib/trace-page-path'
import { readState } from '@/lib/url-state'

describe('tracePagePath', () => {
    it('is the run’s page', () => {
        expect(tracePagePath('run-1')).toBe('/traces/run-1')
        expect(tracePagePath('a/b c')).toBe('/traces/a%2Fb%20c')
    })

    it('selects the span the trace page reads from its address', () => {
        const [pathname, query] = tracePagePath('run-1', {
            span: 'span/1 é',
        }).split('?')

        expect(pathname).toBe('/traces/run-1')
        expect(readState(traceParams, new URLSearchParams(query)).span).toBe(
            'span/1 é',
        )
    })

    it('adds nothing for no span', () => {
        expect(tracePagePath('run-1', { span: null })).toBe('/traces/run-1')
        expect(tracePagePath('run-1', { span: '' })).toBe('/traces/run-1')
    })
})
