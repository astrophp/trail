import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TokenCount } from '@/components/telemetry/token-count'

describe('TokenCount', () => {
    it('shows a count with thousands separators', () => {
        render(<TokenCount count={12_345} />)

        expect(screen.getByText('12,345')).toBeInTheDocument()
    })

    it('keeps a real zero as zero', () => {
        render(<TokenCount count={0} />)

        expect(screen.getByText('0')).toBeInTheDocument()
    })

    it('says a missing count was not reported, never zero', () => {
        render(<TokenCount count={null} />)

        expect(screen.getByText('Not reported')).toBeInTheDocument()
        expect(screen.queryByText('0')).not.toBeInTheDocument()
    })

    it('says pending while the call is in flight, even with a count so far', () => {
        render(<TokenCount count={120} pending />)

        expect(screen.getByText('Pending')).toBeInTheDocument()
        expect(screen.queryByText('120')).not.toBeInTheDocument()
    })

    it('shows the count so far for a pending count when asked, flagged for assistive technology', () => {
        render(<TokenCount count={120} pending pendingAmount="show" />)

        expect(screen.getByText(/^120/)).toBeInTheDocument()
        expect(screen.getByText(', still running, so far')).toHaveClass(
            'sr-only',
        )
        expect(screen.queryByText('Pending')).not.toBeInTheDocument()
    })

    it('says Pending, never zero, for a pending count that was not recorded, even when asked to show', () => {
        render(<TokenCount count={null} pending pendingAmount="show" />)

        expect(screen.getByText('Pending')).toBeInTheDocument()
        expect(screen.queryByText('0')).not.toBeInTheDocument()
    })

    it('keeps a settled count as it is when asked to show pending ones', () => {
        render(<TokenCount count={5} pendingAmount="show" />)

        expect(screen.getByText('5')).toBeInTheDocument()
        expect(screen.queryByText(/still running/)).not.toBeInTheDocument()
    })
})
