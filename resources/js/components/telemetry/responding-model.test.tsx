import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RespondingModel } from '@/components/telemetry/responding-model'

describe('RespondingModel', () => {
    it('names the model that answered when it differs from the requested one', () => {
        render(<RespondingModel model="a" responding="a-2025" />)

        expect(screen.getByText(/^Responded as/)).toBeInTheDocument()
        expect(screen.getByText('a-2025')).toBeInTheDocument()
    })

    it('says nothing when the answering model is the requested one', () => {
        const { container } = render(
            <RespondingModel model="a" responding="a" expected />,
        )

        expect(container).toBeEmptyDOMElement()
    })

    it('says it was not captured when it was expected', () => {
        render(<RespondingModel model="a" responding={null} expected />)

        expect(
            screen.getByText('Responding model not captured'),
        ).toBeInTheDocument()
    })

    it('says nothing when it was not expected, or when there is none to report', () => {
        const { container, rerender } = render(
            <RespondingModel model="a" responding={null} />,
        )

        expect(container).toBeEmptyDOMElement()

        rerender(<RespondingModel model="a" expected={false} />)

        expect(container).toBeEmptyDOMElement()
    })

    it('accepts a className', () => {
        const { container } = render(
            <RespondingModel model="a" responding="b" className="extra" />,
        )

        expect(container.firstElementChild).toHaveClass('extra')
    })
})
