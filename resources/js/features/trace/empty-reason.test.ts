import { describe, expect, it } from 'vitest'
import { emptyReason } from '@/features/trace/empty-reason'

describe('emptyReason', () => {
    it('says a running span has not finished, whatever capture did', () => {
        expect(
            emptyReason({ status: 'running' }, { state: 'not_captured' }),
        ).toBe('This span has not finished. Nothing more has been stored yet.')
    })

    it('says no payloads were stored when the run stored none', () => {
        expect(
            emptyReason({ status: 'completed' }, { state: 'not_captured' }),
        ).toContain('Payload capture may be switched off')
    })

    it('otherwise says nothing was stored for this span', () => {
        expect(emptyReason({ status: 'failed' }, { state: 'partial' })).toBe(
            'No input or output was stored for this span.',
        )
        expect(
            emptyReason({ status: 'completed' }, { state: 'captured' }),
        ).toBe('No input or output was stored for this span.')
    })
})
