import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NounCount } from '@/components/telemetry/noun-count'

const show = (count: number | null | undefined) => {
    render(<NounCount count={count} singular="run" plural="runs" />)

    return screen.getByText(/./)
}

describe('NounCount', () => {
    it('uses the singular for one', () => {
        expect(show(1)).toHaveTextContent('1 run')
    })

    it('uses the plural otherwise, with a real zero, and separators', () => {
        expect(show(1204)).toHaveTextContent('1,204 runs')
    })

    it('says a zero is zero', () => {
        expect(show(0)).toHaveTextContent('0 runs')
    })

    it.each([null, undefined])(
        'says %s was not captured, not zero',
        (count) => {
            const text = show(count)

            expect(text).toHaveTextContent('Not captured')
            expect(text).not.toHaveTextContent('0')
        },
    )
})
