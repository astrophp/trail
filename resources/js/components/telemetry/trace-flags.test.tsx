import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TraceFlags } from '@/components/telemetry/trace-flags'

describe('TraceFlags', () => {
    it('renders nothing when neither flag is set', () => {
        const { container } = render(
            <TraceFlags trace={{ recovered: false, child_failed: false }} />,
        )

        expect(container).toBeEmptyDOMElement()
    })

    it('shows Recovered', () => {
        render(<TraceFlags trace={{ recovered: true, child_failed: false }} />)

        expect(screen.getByText('Recovered')).toBeInTheDocument()
        expect(screen.queryByText('Child failed')).not.toBeInTheDocument()
    })

    it('shows Child failed', () => {
        render(<TraceFlags trace={{ recovered: false, child_failed: true }} />)

        expect(screen.getByText('Child failed')).toBeInTheDocument()
        expect(screen.queryByText('Recovered')).not.toBeInTheDocument()
    })

    it('shows both', () => {
        render(<TraceFlags trace={{ recovered: true, child_failed: true }} />)

        expect(screen.getByText('Recovered')).toBeInTheDocument()
        expect(screen.getByText('Child failed')).toBeInTheDocument()
    })

    it('accepts a className', () => {
        const { container } = render(
            <TraceFlags
                trace={{ recovered: true, child_failed: false }}
                className="extra"
            />,
        )

        expect(container.firstElementChild).toHaveClass('extra')
    })
})
