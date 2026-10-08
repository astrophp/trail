import { describe, expect, it } from 'vitest'
import { truncationAt } from '@/components/telemetry/payload-truncation'

const paths = {
    'input.messages.0.content': 12000,
    'output.text': 500,
    error_message: 90,
}

describe('truncationAt', () => {
    it('is cut, with its length, for the exact path', () => {
        expect(truncationAt(paths, 'output.text')).toEqual({
            truncated: true,
            originalLength: 500,
        })
    })

    it('is cut, without a length, for a path that holds a cut path', () => {
        expect(truncationAt(paths, 'input.messages.0')).toEqual({
            truncated: true,
            originalLength: undefined,
        })
        expect(truncationAt(paths, 'input')).toEqual({
            truncated: true,
            originalLength: undefined,
        })
    })

    it('is not cut for another path, nor for a path that only shares a prefix of letters', () => {
        expect(truncationAt(paths, 'input.prompt')).toEqual({
            truncated: false,
            originalLength: undefined,
        })
        expect(truncationAt(paths, 'output.te').truncated).toBe(false)
        expect(truncationAt(paths, 'input.messages.1').truncated).toBe(false)
        expect(truncationAt({}, 'input').truncated).toBe(false)
    })

    it('treats the empty path as the whole span', () => {
        expect(truncationAt(paths, '').truncated).toBe(true)
        expect(truncationAt({}, '').truncated).toBe(false)
    })
})
