import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AttemptLabel } from '@/components/telemetry/attempt-label'

describe('AttemptLabel', () => {
    it('renders nothing for a run with one attempt', () => {
        const { container } = render(<AttemptLabel attempt={1} of={1} />)

        expect(container).toBeEmptyDOMElement()
    })

    it('renders nothing when no attempt count is known', () => {
        const { container } = render(<AttemptLabel attempt={1} of={0} />)

        expect(container).toBeEmptyDOMElement()
    })

    it.each([
        ['NaN attempt', Number.NaN, 2],
        ['NaN count', 1, Number.NaN],
        ['infinite count', 1, Number.POSITIVE_INFINITY],
        ['fractional attempt', 1.5, 2],
        ['attempt of 0', 0, 2],
        ['negative attempt', -1, 2],
        ['attempt beyond the count', 3, 2],
    ])('renders nothing for %s', (_name, attempt, of) => {
        const { container } = render(<AttemptLabel attempt={attempt} of={of} />)

        expect(container).toBeEmptyDOMElement()
    })

    it('names the attempt of a run with two', () => {
        render(<AttemptLabel attempt={1} of={2} />)

        expect(screen.getByText('Attempt 1 of 2')).toBeInTheDocument()
    })

    it('names the last attempt', () => {
        render(<AttemptLabel attempt={3} of={3} />)

        expect(screen.getByText('Attempt 3 of 3')).toBeInTheDocument()
    })

    it('accepts a className', () => {
        const { container } = render(
            <AttemptLabel attempt={2} of={2} className="extra" />,
        )

        expect(screen.getByText('Attempt 2 of 2')).toBeInTheDocument()
        expect(container.firstElementChild).toHaveClass('extra')
    })
})
