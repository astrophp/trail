import { describe, expect, it } from 'vitest'
import { truncationUnseen } from '@/features/trace/truncation-unseen'

const paths = {
    'input.messages.0.content': 12000,
    'output.text': 500,
    error_message: 90,
}

describe('truncationUnseen', () => {
    const span = {
        type: 'step',
        truncated: true,
        truncated_paths: paths,
    } as const

    it('is false when a cut path is inside the tab', () => {
        expect(truncationUnseen(span, 'input')).toBe(false)
        expect(truncationUnseen(span, 'output')).toBe(false)
    })

    it('is true when the cut paths are elsewhere', () => {
        expect(
            truncationUnseen(
                { ...span, truncated_paths: { 'output.text': 5 } },
                'input',
            ),
        ).toBe(true)
        expect(truncationUnseen(span, 'metadata')).toBe(true)
    })

    it('is true when the span is truncated without any path', () => {
        expect(
            truncationUnseen({ ...span, truncated_paths: {} }, 'input'),
        ).toBe(true)
    })

    it('is true on a tab whose cut part is the error message', () => {
        expect(
            truncationUnseen(
                { ...span, truncated_paths: { error_message: 9 } },
                'output',
            ),
        ).toBe(true)
    })

    it('is false for a span that was not truncated, and on the raw tab', () => {
        expect(
            truncationUnseen(
                { ...span, truncated: false, truncated_paths: {} },
                'input',
            ),
        ).toBe(false)
        expect(truncationUnseen({ ...span, truncated_paths: {} }, 'raw')).toBe(
            false,
        )
    })

    it('is true for an embedding, which shows no payload in a viewer', () => {
        expect(truncationUnseen({ ...span, type: 'embedding' }, 'input')).toBe(
            true,
        )
    })
})
