import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TraceId } from '@/components/telemetry/trace-id'

const id = '019a3f2c-7b1e-7d4a-9c55-0e8f2a6b4d31'

describe('TraceId', () => {
    it('shortens the id', () => {
        render(<TraceId id={id} />)

        expect(screen.getByText('019a3f2c…4d31')).toBeInTheDocument()
    })

    it('has the whole id on hover and for assistive technology', () => {
        const { container } = render(<TraceId id={id} />)

        expect(container.firstElementChild).toHaveAttribute('title', id)
        expect(screen.getByText(id)).toHaveClass('sr-only')
        expect(screen.getByText('019a3f2c…4d31')).toHaveAttribute(
            'aria-hidden',
            'true',
        )
    })

    it('shows the whole id as visible text when asked, and lets it wrap', () => {
        const { container } = render(<TraceId id={id} full />)

        expect(screen.getByText(id)).not.toHaveClass('sr-only')
        expect(screen.queryByText('019a3f2c…4d31')).not.toBeInTheDocument()
        expect(container.firstElementChild).toHaveClass(
            'font-mono',
            'wrap-anywhere',
        )
    })

    it('is set in the mono family', () => {
        const { container } = render(<TraceId id={id} />)

        expect(container.firstElementChild).toHaveClass('font-mono')
    })

    it('accepts a className', () => {
        const { container } = render(<TraceId id={id} className="extra" />)

        expect(container.firstElementChild).toHaveClass('extra')
    })
})
